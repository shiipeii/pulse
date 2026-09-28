import { supabaseRead } from "./supabase";
import { getBacklog, getSourceRegister } from "./queries";
import type { Theme } from "./types";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// North star: 14-day decision rate
// ─────────────────────────────────────────────────────────────────────────────

export interface DecisionRate {
  rate: number | null;
  decided: number;
  total: number;
  notNowShare: number | null;
  from: string;
  to: string;
}

/**
 * Share of items that had a recorded decision within 14 days of arriving.
 * An item is decided when (1) a PM verified it, (2) it is in a theme, and
 * (3) that theme has a decision: a filed ticket, or any status other than
 * Open (Being fixed, Fixed, Planned, Released, Not now).
 *
 * Measured over items that arrived 14–44 days ago, so each one has had its
 * full 14 days.
 */
export async function getDecisionRate(productId: string): Promise<DecisionRate> {
  const db = supabaseRead();
  const fromIso = ago(44);
  const toIso = ago(14);
  const [{ data: items }, { data: themes }, { data: tickets }] = await Promise.all([
    db
      .from("feedback")
      .select("received_at, verified_at, theme_id")
      .eq("product_id", productId)
      .gte("received_at", fromIso)
      .lt("received_at", toIso)
      .limit(50000),
    db.from("themes").select("id, status, decided_at").eq("product_id", productId),
    db.from("tickets").select("theme_id, filed_at").eq("product_id", productId).eq("status", "filed"),
  ]);

  const decisionAt = new Map<string, number>();
  for (const t of themes ?? []) {
    if (t.status !== "open" && t.decided_at) decisionAt.set(t.id, new Date(t.decided_at).getTime());
  }
  for (const k of tickets ?? []) {
    if (!k.filed_at) continue;
    const at = new Date(k.filed_at).getTime();
    const prev = decisionAt.get(k.theme_id);
    decisionAt.set(k.theme_id, prev ? Math.min(prev, at) : at);
  }

  let decided = 0;
  for (const i of items ?? []) {
    if (!i.verified_at || !i.theme_id) continue;
    const d = decisionAt.get(i.theme_id);
    if (!d) continue;
    const received = new Date(i.received_at).getTime();
    const doneAt = Math.max(received, d, new Date(i.verified_at).getTime());
    if (doneAt - received <= 14 * DAY) decided += 1;
  }
  const total = items?.length ?? 0;

  const decidedThemes = (themes ?? []).filter((t) => t.status !== "open");
  const notNow = decidedThemes.filter((t) => t.status === "not_now").length;

  return {
    rate: total ? Math.round((decided / total) * 100) : null,
    decided,
    total,
    notNowShare: decidedThemes.length ? Math.round((notNow / decidedThemes.length) * 100) : null,
    from: fromIso,
    to: toIso,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PM home
// ─────────────────────────────────────────────────────────────────────────────

export interface Alert {
  kind: "critical" | "regression";
  theme: Pick<Theme, "id" | "label" | "status" | "owner">;
  detail: string;
}

/** Critical bugs reported in the last 7 days, and bugs that came back after a fix. */
export async function getAlerts(productId: string): Promise<Alert[]> {
  const db = supabaseRead();
  const [{ data: critical }, { data: regressed }] = await Promise.all([
    db
      .from("feedback")
      .select("theme_id, themes!inner(id, label, status, owner, category)")
      .eq("product_id", productId)
      .eq("severity", "critical")
      .gte("received_at", ago(7))
      .not("theme_id", "is", null),
    db
      .from("themes")
      .select("id, label, status, owner")
      .eq("product_id", productId)
      .eq("category", "bug")
      .eq("regressed", true)
      .neq("status", "fixed"),
  ]);

  const alerts: Alert[] = [];
  for (const t of regressed ?? []) {
    alerts.push({ kind: "regression", theme: t, detail: "Reported again after it was marked fixed." });
  }
  const perTheme = new Map<string, { theme: Alert["theme"]; n: number }>();
  for (const row of (critical ?? []) as unknown as { themes: Alert["theme"] & { category: string } }[]) {
    const t = row.themes;
    if (!t || t.category !== "bug" || t.status === "fixed") continue;
    const cur = perTheme.get(t.id) ?? { theme: t, n: 0 };
    cur.n += 1;
    perTheme.set(t.id, cur);
  }
  for (const { theme, n } of Array.from(perTheme.values()).sort((a, b) => b.n - a.n)) {
    if (alerts.some((a) => a.theme.id === theme.id)) continue;
    alerts.push({ kind: "critical", theme, detail: `${n} critical report${n === 1 ? "" : "s"} in the last 7 days.` });
  }
  return alerts;
}

/** Themes still Open with no decision, 14+ days after they first appeared. */
export async function getStaleThemes(productId: string, limit = 6) {
  const { data } = await supabaseRead()
    .from("themes")
    .select("id, label, category, frequency, created_at, owner")
    .eq("product_id", productId)
    .eq("status", "open")
    .is("decided_at", null)
    .in("category", ["bug", "feature"])
    .gt("frequency", 0)
    .lt("created_at", ago(14))
    .order("frequency", { ascending: false })
    .limit(limit);
  return (data ?? []).map((t) => ({ ...t, days: Math.floor((Date.now() - new Date(t.created_at).getTime()) / DAY) }));
}

export async function getTicketDraftCount(productId: string): Promise<number> {
  const { count } = await supabaseRead()
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("status", "draft");
  return count ?? 0;
}

export interface SourceHealth {
  id: string;
  name: string;
  owner: string | null;
  state: "flowing" | "quiet" | "not_connected";
  lastAt: string | null;
}

/**
 * Is each source still flowing in? A connected source with nothing new for
 * 14 days is marked quiet, so a broken FormSG webhook or mailbox is noticed.
 */
export async function getSourceHealth(productId: string): Promise<{ rows: SourceHealth[]; coverage: number }> {
  const db = supabaseRead();
  const [{ data: sources }, { data: recent }] = await Promise.all([
    db.from("sources").select("id, name, owner, status, channel_id").eq("product_id", productId).order("created_at"),
    db
      .from("feedback")
      .select("channel_id, received_at")
      .eq("product_id", productId)
      .gte("received_at", ago(120))
      .order("received_at", { ascending: false })
      .limit(20000),
  ]);
  const last = new Map<string, string>();
  for (const r of recent ?? []) if (!last.has(r.channel_id)) last.set(r.channel_id, r.received_at);

  const rows: SourceHealth[] = (sources ?? []).map((s) => {
    const lastAt = s.channel_id ? last.get(s.channel_id) ?? null : null;
    const state: SourceHealth["state"] =
      s.status === "not_connected" ? "not_connected" : lastAt && Date.now() - new Date(lastAt).getTime() < 14 * DAY ? "flowing" : "quiet";
    return { id: s.id, name: s.name, owner: s.owner, state, lastAt };
  });
  const covered = rows.filter((r) => r.state !== "not_connected").length;
  return { rows, coverage: rows.length ? Math.round((covered / rows.length) * 100) : 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Engineer home: "My bugs" with a reproduction summary
// ─────────────────────────────────────────────────────────────────────────────

export interface ReproSummary {
  theme: Theme;
  reports: number;
  last7: number;
  prev7: number;
  devices: [string, number][];
  browsers: [string, number][];
  areas: [string, number][];
  where: string[];
  screenshots: number;
  quotes: string[];
  firstAt: string | null;
  lastAt: string | null;
}

const DEVICES = ["Computer", "Phone", "Tablet"];
const BROWSERS = ["Chrome", "Safari", "Edge", "Firefox", "Not sure"];

function pick(list: string[], text: string): string | null {
  const lower = text.toLowerCase();
  return list.find((x) => lower.includes(x.toLowerCase())) ?? null;
}

function tally(values: (string | null)[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

/** Bugs in progress or waiting, each with what an engineer needs to reproduce it. */
export async function getEngineerBugs(productId: string): Promise<ReproSummary[]> {
  const db = supabaseRead();
  const { data: themes } = await db
    .from("themes")
    .select("*")
    .eq("product_id", productId)
    .eq("category", "bug")
    .in("status", ["open", "being_fixed"])
    .gt("frequency", 0);
  const list = (themes as Theme[]) ?? [];
  if (list.length === 0) return [];

  const { data: items } = await db
    .from("feedback")
    .select("id, theme_id, raw_text, raw_payload, feature_area, received_at")
    .eq("product_id", productId)
    .in(
      "theme_id",
      list.map((t) => t.id),
    )
    .order("received_at", { ascending: false })
    .limit(5000);

  const ids = (items ?? []).map((i) => i.id);
  const { data: shots } = ids.length
    ? await db.from("attachments").select("feedback_id").in("feedback_id", ids)
    : { data: [] as { feedback_id: string }[] };
  const shotCount = new Map<string, number>();
  (shots ?? []).forEach((s) => shotCount.set(s.feedback_id, (shotCount.get(s.feedback_id) ?? 0) + 1));

  const byTheme = new Map<string, NonNullable<typeof items>>();
  for (const i of items ?? []) {
    const arr = byTheme.get(i.theme_id) ?? [];
    arr.push(i);
    byTheme.set(i.theme_id, arr);
  }

  const now = Date.now();
  return list
    .map((theme) => {
      const its = byTheme.get(theme.id) ?? [];
      const devices: (string | null)[] = [];
      const browsers: (string | null)[] = [];
      const where: string[] = [];
      for (const i of its) {
        const p = (i.raw_payload ?? {}) as Record<string, unknown>;
        const using = /Using:\s*(.+)/i.exec(i.raw_text)?.[1] ?? "";
        devices.push(typeof p.device === "string" && p.device ? p.device : pick(DEVICES, using));
        browsers.push(typeof p.browser === "string" && p.browser ? p.browser : pick(BROWSERS, using));
        const w = (typeof p.where === "string" && p.where) || /Where it happened:\s*(.+)/i.exec(i.raw_text)?.[1];
        if (w && where.length < 3 && !where.includes(w.trim())) where.push(w.trim());
      }
      const age = (i: { received_at: string }) => now - new Date(i.received_at).getTime();
      return {
        theme,
        reports: its.length,
        last7: its.filter((i) => age(i) < 7 * DAY).length,
        prev7: its.filter((i) => age(i) >= 7 * DAY && age(i) < 14 * DAY).length,
        devices: tally(devices),
        browsers: tally(browsers),
        areas: tally(its.map((i) => i.feature_area)),
        where,
        screenshots: its.reduce((n, i) => n + (shotCount.get(i.id) ?? 0), 0),
        quotes: its.slice(0, 2).map((i) => i.raw_text.split(/\n\n(Where it happened|Expected|Using):/)[0].slice(0, 220)),
        firstAt: its.length ? its[its.length - 1].received_at : null,
        lastAt: its.length ? its[0].received_at : null,
      };
    })
    .sort((a, b) => (a.theme.status === b.theme.status ? b.reports * b.theme.severity_score - a.reports * a.theme.severity_score : a.theme.status === "being_fixed" ? -1 : 1));
}

/** Does this owner name match the signed-in person? Owners are free text, e.g. "Wei Jie (Eng)". */
export function isMine(owner: string | null, me: { name?: string; email: string }): boolean {
  if (!owner) return false;
  const o = owner.toLowerCase();
  const name = (me.name ?? "").toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim();
  const local = me.email.split("@")[0].toLowerCase();
  return (name.length > 1 && o.includes(name)) || o.includes(local) || o === me.email.toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Stakeholder / leadership summary (no names or emails)
// ─────────────────────────────────────────────────────────────────────────────

export async function getLeadershipSummary(productId: string) {
  const db = supabaseRead();
  const [last30, prev30, told, wouldTell, shipped, report, backlog, reg, rate] = await Promise.all([
    db.from("feedback").select("id", { count: "exact", head: true }).eq("product_id", productId).gte("received_at", ago(30)),
    db
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .gte("received_at", ago(60))
      .lt("received_at", ago(30)),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("status", "sent").gte("sent_at", ago(90)),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("status", "skipped_no_provider")
      .gte("sent_at", ago(90)),
    db
      .from("themes")
      .select("id, label, category, status, fixed_at, released_at, frequency")
      .eq("product_id", productId)
      .in("status", ["fixed", "released"])
      .or(`fixed_at.gte.${ago(30)},released_at.gte.${ago(30)}`),
    db
      .from("reports")
      .select("id, kind, period_start, period_end, sent_at")
      .eq("product_id", productId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getBacklog(productId),
    getSourceRegister(productId),
    getDecisionRate(productId),
  ]);

  const open = backlog.filter((r) => ["open", "being_fixed", "planned"].includes(r.theme.status));
  const thisMonth = reg.months[reg.months.length - 1];
  return {
    volume: last30.count ?? 0,
    volumePrev: prev30.count ?? 0,
    told: told.count ?? 0,
    wouldTell: wouldTell.count ?? 0,
    shipped: shipped.data ?? [],
    lastReport: report.data,
    topBugs: open.filter((r) => r.theme.category === "bug").slice(0, 3),
    topFeatures: open.filter((r) => r.theme.category === "feature").slice(0, 3),
    coverage: reg.coverage,
    oneChannel: thisMonth && thisMonth.total ? Math.round((thisMonth.native / thisMonth.total) * 100) : null,
    months: reg.months,
    rate,
  };
}
