import { supabaseRead } from "./supabase";
import type { Feedback, Theme, ThemeStats } from "./types";

export interface FeedFilters {
  featureArea?: string;
  segment?: string;
  channelId?: string;
  since?: string; // ISO date
  status?: string;
  category?: string;
}

/** Themes ranked by frequency × severity (the PRD's ranking), tenant-scoped. */
export async function getThemes(productId: string): Promise<Theme[]> {
  const { data, error } = await supabaseRead()
    .from("themes")
    .select("*")
    .eq("product_id", productId);
  if (error) throw new Error(error.message);

  return (data as Theme[]).sort(
    (a, b) => b.frequency * b.severity_score - a.frequency * a.severity_score,
  );
}

/**
 * Bug and feature themes rank differently:
 *   • bugs     — open first, then frequency × severity (pain)
 *   • features — frequency (demand: how many people asked)
 *   • other    — praise / questions; positive ones are the highlights
 */
export function groupThemes(themes: Theme[]): {
  bugs: Theme[];
  fixedBugs: Theme[];
  features: Theme[];
  other: Theme[];
} {
  const live = themes.filter((t) => t.frequency > 0);
  const bugs = live
    .filter((t) => t.category === "bug" && (t.status === "open" || t.status === "being_fixed"))
    .sort((a, b) => b.frequency * b.severity_score - a.frequency * a.severity_score);
  const fixedBugs = live.filter((t) => t.category === "bug" && t.status === "fixed");
  const features = live
    .filter((t) => t.category === "feature" && (t.status === "open" || t.status === "planned"))
    .sort((a, b) => b.frequency - a.frequency || b.severity_score - a.severity_score);
  const other = live
    .filter((t) => t.category !== "bug" && t.category !== "feature" && t.status !== "not_now")
    .sort((a, b) => b.frequency - a.frequency);
  return { bugs, fixedBugs, features, other };
}

/**
 * PM review queue: enriched items not yet verified, AI-corrected ones first.
 */
export async function getReviewQueue(productId: string, limit = 100): Promise<Feedback[]> {
  const { data, error } = await supabaseRead()
    .from("feedback")
    .select("*")
    .eq("product_id", productId)
    .eq("review_status", "pending")
    .not("category", "is", null)
    .order("ai_corrected", { ascending: false })
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as Feedback[];
}

export async function getReviewCounts(
  productId: string,
): Promise<{ pending: number; corrected: number }> {
  const db = supabaseRead();
  const [p, c] = await Promise.all([
    db
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("review_status", "pending")
      .not("category", "is", null),
    db
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("review_status", "pending")
      .eq("ai_corrected", true),
  ]);
  return { pending: p.count ?? 0, corrected: c.count ?? 0 };
}

/**
 * Split themes into lowlights (what to act on — negative sentiment, ranked by
 * frequency × severity) and highlights (what's landing well — positive
 * sentiment, ranked by frequency).
 */
export function splitThemes(themes: Theme[]): { lowlights: Theme[]; highlights: Theme[] } {
  const lowlights = themes
    .filter((t) => t.sentiment === "negative" || t.sentiment == null)
    .filter((t) => t.frequency > 0);
  const highlights = themes
    .filter((t) => t.sentiment === "positive")
    .filter((t) => t.frequency > 0)
    .sort((a, b) => b.frequency - a.frequency);
  return { lowlights, highlights };
}

/** Recent feedback feed with filters. */
export async function getFeed(
  productId: string,
  filters: FeedFilters = {},
  limit = 50,
): Promise<Feedback[]> {
  let q = supabaseRead()
    .from("feedback")
    .select("*")
    .eq("product_id", productId)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (filters.featureArea) q = q.eq("feature_area", filters.featureArea);
  if (filters.segment) q = q.eq("segment", filters.segment);
  if (filters.channelId) q = q.eq("channel_id", filters.channelId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.since) q = q.gte("received_at", filters.since);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as Feedback[];
}

/** A theme plus its member feedback items (theme → raw items drill-down). */
export async function getThemeWithItems(
  productId: string,
  themeId: string,
): Promise<{ theme: Theme; items: Feedback[] } | null> {
  const db = supabaseRead();
  const { data: theme } = await db
    .from("themes")
    .select("*")
    .eq("product_id", productId)
    .eq("id", themeId)
    .maybeSingle();
  if (!theme) return null;

  const { data: items, error } = await db
    .from("feedback")
    .select("*")
    .eq("product_id", productId)
    .eq("theme_id", themeId)
    .order("severity", { ascending: false })
    .order("received_at", { ascending: false });
  if (error) throw new Error(error.message);

  return { theme: theme as Theme, items: items as Feedback[] };
}

/** Distinct filter values + channels for the dashboard controls. */
export async function getFilterOptions(productId: string): Promise<{
  featureAreas: string[];
  segments: string[];
  channels: { id: string; name: string }[];
}> {
  const db = supabaseRead();
  const [{ data: fb }, { data: ch }] = await Promise.all([
    db.from("feedback").select("feature_area, segment").eq("product_id", productId),
    db.from("channels").select("id, name").eq("product_id", productId),
  ]);

  const featureAreas = uniq((fb ?? []).map((r) => r.feature_area).filter(Boolean) as string[]);
  const segments = uniq((fb ?? []).map((r) => r.segment).filter(Boolean) as string[]);
  return { featureAreas, segments, channels: (ch ?? []) as { id: string; name: string }[] };
}

/** Counts by status — the time-to-signal pipeline at a glance. */
export async function getStats(productId: string): Promise<Record<string, number>> {
  const { data, error } = await supabaseRead()
    .from("feedback")
    .select("status")
    .eq("product_id", productId);
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = { total: 0 };
  for (const row of data as { status: string }[]) {
    counts.total += 1;
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase B + C queries
// ─────────────────────────────────────────────────────────────────────────────

export async function getThemeStatsMap(productId: string): Promise<Map<string, ThemeStats>> {
  const { data } = await supabaseRead().from("theme_stats").select("*").eq("product_id", productId);
  return new Map(((data as ThemeStats[]) ?? []).map((s) => [s.theme_id, s]));
}

export interface BacklogRow {
  theme: Theme;
  stats: ThemeStats | undefined;
  score: number;
  ticket: { status: string; jira_key: string | null; url: string | null } | null;
}

/**
 * FR-92 prioritised backlog: every open bug and feature in one ranked list.
 * Score = reporters × severity for bugs, reporters × 2 for features
 * (demand counted as "medium" pain), so the two kinds rank on one scale.
 */
export async function getBacklog(productId: string): Promise<BacklogRow[]> {
  const db = supabaseRead();
  const [{ data: themes }, stats, { data: tickets }] = await Promise.all([
    db.from("themes").select("*").eq("product_id", productId).gt("frequency", 0),
    getThemeStatsMap(productId),
    db.from("tickets").select("theme_id, status, jira_key, url").eq("product_id", productId),
  ]);
  const tByTheme = new Map((tickets ?? []).map((t) => [t.theme_id, t]));
  return ((themes as Theme[]) ?? [])
    .filter((t) => t.category !== "other")
    .map((t) => {
      const s = stats.get(t.id);
      const reporters = s?.reporters ?? t.frequency;
      const score = t.category === "bug" ? reporters * Math.max(1, Number(t.severity_score)) : reporters * 2;
      const tk = tByTheme.get(t.id);
      return { theme: t, stats: s, score, ticket: tk ? { status: tk.status, jira_key: tk.jira_key, url: tk.url } : null };
    })
    .sort((a, b) => b.score - a.score);
}

/** Teacher portal: this person's items with their theme (FR-51, FR-52). */
export async function getMyFeedback(email: string) {
  const { data } = await supabaseRead()
    .from("feedback")
    .select("id, raw_text, summary, category, user_category, review_status, received_at, theme_id, themes(id, label, status, category, released_at, fixed_at)")
    .eq("submitter_email", email.toLowerCase())
    .order("received_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as {
    id: string;
    raw_text: string;
    summary: string | null;
    category: string | null;
    user_category: string | null;
    review_status: string;
    received_at: string;
    theme_id: string | null;
    themes: { id: string; label: string; status: string; category: string; released_at: string | null; fixed_at: string | null } | null;
  }[];
}

/** Top feature themes by demand, for the teacher suggestions list. */
export async function getTopSuggestions(limit = 20) {
  const db = supabaseRead();
  const { data: themes } = await db.from("themes").select("id, label, status, released_at, product_id").eq("category", "feature").gt("frequency", 0);
  const ids = (themes ?? []).map((t) => t.id);
  const { data: stats } = ids.length ? await db.from("theme_stats").select("theme_id, reporters").in("theme_id", ids) : { data: [] };
  const rep = new Map((stats ?? []).map((s) => [s.theme_id, s.reporters as number]));
  return (themes ?? [])
    .map((t) => ({ ...t, reporters: rep.get(t.id) ?? 0 }))
    .sort((a, b) => b.reporters - a.reporters)
    .slice(0, limit);
}

/** Per-theme evidence: reports by channel and by week (FR-33). */
export async function getThemeEvidence(themeId: string) {
  const db = supabaseRead();
  const { data: items } = await db.from("feedback").select("channel_id, received_at").eq("theme_id", themeId);
  const { data: channels } = await db.from("channels").select("id, name");
  const name = new Map((channels ?? []).map((c) => [c.id, c.name]));
  const byChannel = new Map<string, number>();
  const weeks: { label: string; count: number }[] = [];
  const now = Date.now();
  for (let w = 7; w >= 0; w--) {
    const start = new Date(now - (w + 1) * 7 * 86_400_000);
    weeks.push({ label: start.toLocaleDateString("en-SG", { day: "numeric", month: "short" }), count: 0 });
  }
  for (const it of items ?? []) {
    const n = name.get(it.channel_id) ?? "Other";
    byChannel.set(n, (byChannel.get(n) ?? 0) + 1);
    const age = Math.floor((now - new Date(it.received_at).getTime()) / (7 * 86_400_000));
    if (age >= 0 && age < 8) weeks[7 - age].count += 1;
  }
  return {
    channels: Array.from(byChannel.entries()).sort((a, b) => b[1] - a[1]),
    weeks,
    total: items?.length ?? 0,
  };
}

export async function getAttachmentsFor(feedbackIds: string[]) {
  if (feedbackIds.length === 0) return new Map<string, string[]>();
  const { data } = await supabaseRead().from("attachments").select("feedback_id, path").in("feedback_id", feedbackIds);
  const m = new Map<string, string[]>();
  (data ?? []).forEach((a) => m.set(a.feedback_id, [...(m.get(a.feedback_id) ?? []), a.path]));
  return m;
}

/** Source register with volume share, coverage and one-channel trend (FR-90, FR-97). */
export async function getSourceRegister(productId: string) {
  const db = supabaseRead();
  const [{ data: sources }, { data: channels }, { data: items }] = await Promise.all([
    db.from("sources").select("*").eq("product_id", productId).order("created_at"),
    db.from("channels").select("id, name, type").eq("product_id", productId),
    db
      .from("feedback")
      .select("channel_id, received_at")
      .eq("product_id", productId)
      .gte("received_at", new Date(Date.now() - 183 * 86_400_000).toISOString())
      .limit(50000),
  ]);
  const chType = new Map((channels ?? []).map((c) => [c.id, c.type as string]));
  const perChannel = new Map<string, number>();
  (items ?? []).forEach((i) => perChannel.set(i.channel_id, (perChannel.get(i.channel_id) ?? 0) + 1));
  const total = items?.length ?? 0;

  const months: { label: string; total: number; native: number }[] = [];
  const now = new Date();
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    months.push({ label: d.toLocaleDateString("en-SG", { month: "short" }), total: 0, native: 0 });
  }
  (items ?? []).forEach((i) => {
    const d = new Date(i.received_at);
    const idx = 5 - ((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
    if (idx >= 0 && idx < 6) {
      months[idx].total += 1;
      if (chType.get(i.channel_id) === "form") months[idx].native += 1;
    }
  });

  const rows = (sources ?? []).map((s) => ({ ...s, items: s.channel_id ? perChannel.get(s.channel_id) ?? 0 : 0 }));
  const covered = rows.filter((r) => r.status !== "not_connected").length;
  return { rows, total, coverage: rows.length ? Math.round((covered / rows.length) * 100) : 0, months, channels: channels ?? [] };
}
