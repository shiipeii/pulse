import { supabaseAdmin } from "./supabase";
import { reportNarrative } from "./anthropic";
import { sendEmail, escapeHtml } from "./email";
import type { Theme } from "./types";

/**
 * Automated reporting (FR-94). Drafts are generated on schedule (weekly on
 * Mondays, monthly on the 1st) or on demand; a PM reviews and sends.
 */
export type ReportKind = "weekly" | "monthly";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function previousPeriod(kind: ReportKind, now = new Date()): { start: Date; end: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (kind === "weekly") {
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    const end = new Date(d.getTime() - dow * 86_400_000); // this Monday (exclusive)
    return { start: new Date(end.getTime() - 7 * 86_400_000), end };
  }
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return { start: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1)), end };
}

export async function generateReport(productId: string, kind: ReportKind): Promise<string> {
  const db = supabaseAdmin();
  const { start, end } = previousPeriod(kind);
  const { data: product } = await db.from("products").select("name").eq("id", productId).single();

  const { data: items } = await db
    .from("feedback")
    .select("id, category, channel_id, theme_id, review_status, received_at")
    .eq("product_id", productId)
    .gte("received_at", start.toISOString())
    .lt("received_at", end.toISOString());
  const list = items ?? [];
  const { data: themes } = await db.from("themes").select("*").eq("product_id", productId);
  const { data: channels } = await db.from("channels").select("id, name").eq("product_id", productId);
  const channelName = new Map((channels ?? []).map((c) => [c.id, c.name]));
  const themeById = new Map(((themes as Theme[]) ?? []).map((t) => [t.id, t]));

  const count = (f: (i: (typeof list)[number]) => boolean) => list.filter(f).length;
  const perTheme = new Map<string, number>();
  list.forEach((i) => i.theme_id && perTheme.set(i.theme_id, (perTheme.get(i.theme_id) ?? 0) + 1));
  const ranked = (cat: string) =>
    Array.from(perTheme.entries())
      .map(([id, n]) => ({ t: themeById.get(id)!, n }))
      .filter((x) => x.t && x.t.category === cat)
      .sort((a, b) => (cat === "bug" ? b.n * b.t.severity_score - a.n * a.t.severity_score : b.n - a.n))
      .slice(0, 5)
      .map((x) => ({ label: x.t.label, reports: x.n, status: x.t.status, severity: Number(x.t.severity_score) }));
  const byChannel: Record<string, number> = {};
  list.forEach((i) => {
    const n = channelName.get(i.channel_id) ?? "Other";
    byChannel[n] = (byChannel[n] ?? 0) + 1;
  });
  const fixed = ((themes as Theme[]) ?? []).filter((t) => t.fixed_at && t.fixed_at >= start.toISOString() && t.fixed_at < end.toISOString());
  const released = ((themes as Theme[]) ?? []).filter(
    (t) => t.released_at && t.released_at >= start.toISOString() && t.released_at < end.toISOString(),
  );

  const facts = {
    product: product?.name,
    period: `${iso(start)} to ${iso(new Date(end.getTime() - 86_400_000))}`,
    total: list.length,
    bugs: count((i) => i.category === "bug"),
    features: count((i) => i.category === "feature"),
    other: count((i) => i.category === "other"),
    verified: count((i) => i.review_status === "verified"),
    by_channel: byChannel,
    top_bugs: ranked("bug"),
    top_features: ranked("feature"),
    praise_and_other: ranked("other"),
    fixed_this_period: fixed.map((t) => t.label),
    released_this_period: released.map((t) => t.label),
  };

  let narrative = { summary: "", highlights: [] as string[], priority_changes: [] as string[] };
  if (list.length > 0) narrative = await reportNarrative(facts).catch(() => narrative);

  const lines = [
    `# ${product?.name ?? "Pulse"} — ${kind === "weekly" ? "weekly digest" : "monthly readout"}`,
    ``,
    `${facts.period} · Draft written by AI from Pulse data; review before sending.`,
    ``,
    `## Summary`,
    ``,
    narrative.summary || `${facts.total} items this period.`,
    ``,
    `| Measure | Count |`,
    `| --- | --- |`,
    `| Total feedback | ${facts.total} |`,
    `| Bug reports | ${facts.bugs} |`,
    `| Feature suggestions | ${facts.features} |`,
    `| Other (praise, questions) | ${facts.other} |`,
    `| Verified by a PM | ${facts.verified} |`,
    ``,
    `## Top bugs`,
    ``,
    ...(facts.top_bugs.length ? facts.top_bugs.map((b, i) => `${i + 1}. ${b.label} — ${b.reports} reports, severity ${b.severity.toFixed(1)}, ${b.status.replace("_", " ")}`) : ["None this period."]),
    ``,
    `## Top feature requests`,
    ``,
    ...(facts.top_features.length ? facts.top_features.map((f, i) => `${i + 1}. ${f.label} — ${f.reports} requests`) : ["None this period."]),
    ``,
    `## What's landing well`,
    ``,
    ...(narrative.highlights.length ? narrative.highlights.map((h) => `- ${h}`) : ["- Nothing notable."]),
    ``,
    `## Suggested priority changes`,
    ``,
    ...(narrative.priority_changes.length ? narrative.priority_changes.map((p) => `- ${p}`) : ["- None."]),
    ``,
    `## Closed this period`,
    ``,
    `- Fixed: ${fixed.length ? fixed.map((t) => t.label).join("; ") : "none"}`,
    `- Released: ${released.length ? released.map((t) => t.label).join("; ") : "none"}`,
    ``,
    `## Where feedback came from`,
    ``,
    ...Object.entries(byChannel).map(([n, c]) => `- ${n}: ${c}`),
  ];
  const content = lines.join("\n");

  const recipients = process.env.REPORT_RECIPIENTS ?? "";
  const { data, error } = await db
    .from("reports")
    .upsert(
      { product_id: productId, kind, period_start: iso(start), period_end: iso(end), content, recipients, status: "draft" },
      { onConflict: "product_id,kind,period_start" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Daily cron: draft the weekly report on Mondays and the monthly on the 1st. */
export async function scheduledReports(at = new Date()): Promise<number> {
  // Schedule in Singapore time (UTC+8): the cron runs at 06:00 SGT.
  const now = new Date(at.getTime() + 8 * 3_600_000);
  const db = supabaseAdmin();
  const { data: products } = await db.from("products").select("id");
  const kinds: ReportKind[] = [];
  if (now.getUTCDay() === 1) kinds.push("weekly");
  if (now.getUTCDate() === 1) kinds.push("monthly");
  let n = 0;
  for (const p of products ?? []) {
    for (const k of kinds) {
      const { start } = previousPeriod(k, now);
      const { data: exists } = await db
        .from("reports")
        .select("id")
        .eq("product_id", p.id)
        .eq("kind", k)
        .eq("period_start", iso(start))
        .maybeSingle();
      if (exists) continue;
      await generateReport(p.id, k).catch(() => undefined);
      n += 1;
    }
  }
  return n;
}

/** Very small Markdown → HTML for emailing a report (headings, lists, tables, paragraphs). */
export function reportToHtml(md: string): string {
  const out: string[] = [];
  let table: string[][] = [];
  const flushTable = () => {
    if (!table.length) return;
    const [head, ...rows] = table.filter((r) => !r.every((c) => /^-+$/.test(c)));
    out.push(
      `<table style="border-collapse:collapse">${[head]
        .map((r) => `<tr>${r.map((c) => `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ccc">${escapeHtml(c)}</th>`).join("")}</tr>`)
        .join("")}${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:4px 8px">${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</table>`,
    );
    table = [];
  };
  for (const line of md.split("\n")) {
    if (line.startsWith("|")) {
      table.push(line.split("|").slice(1, -1).map((c) => c.trim()));
      continue;
    }
    flushTable();
    if (line.startsWith("# ")) out.push(`<h2>${escapeHtml(line.slice(2))}</h2>`);
    else if (line.startsWith("## ")) out.push(`<h3>${escapeHtml(line.slice(3))}</h3>`);
    else if (/^(- |\d+\. )/.test(line)) out.push(`<p style="margin:2px 0">• ${escapeHtml(line.replace(/^(- |\d+\. )/, ""))}</p>`);
    else if (line.trim()) out.push(`<p>${escapeHtml(line)}</p>`);
  }
  flushTable();
  return out.join("\n");
}

export async function sendReport(reportId: string, sender: string): Promise<{ status: string }> {
  const db = supabaseAdmin();
  const { data: r } = await db.from("reports").select("*").eq("id", reportId).single();
  if (!r) throw new Error("Report not found");
  const to = String(r.recipients ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
  if (to.length === 0) throw new Error("Add at least one recipient first.");
  const title = r.content.split("\n")[0].replace(/^# /, "");
  const res = await sendEmail({ to, subject: title, text: r.content, html: reportToHtml(r.content) });
  if (res.status === "no_provider") return { status: "no_provider" };
  if (res.status === "failed") throw new Error(res.error);
  await db.from("reports").update({ status: "sent", sent_by: sender, sent_at: new Date().toISOString() }).eq("id", reportId);
  return { status: "sent" };
}
