import { supabaseAdmin } from "./supabase";
import { impactScore, mentionsRisk, mode, urgency } from "./scoring";

/**
 * Recompute impact, urgency and product area for a product's issues and save
 * them on `themes`. Runs in the daily cron, after each report is grouped, and
 * when the PM changes something that feeds the score (fits goals, clear urgent).
 *
 * Before migration 0006 has been run the new columns don't exist: the update
 * fails, and this returns { skipped } instead of throwing, so nothing breaks.
 */
export async function rescoreProduct(productId: string): Promise<{ scored: number; urgent: number } | { skipped: string }> {
  const db = supabaseAdmin();
  const { data: themes, error } = await db
    .from("themes")
    .select("*")
    .eq("product_id", productId)
    .gt("frequency", 0);
  if (error) return { skipped: error.message };
  let scored = 0;
  let urgentCount = 0;
  for (const t of themes ?? []) {
    const r = await rescoreTheme(t.id, t);
    if ("skipped" in r) return r;
    scored += 1;
    if (r.urgent) urgentCount += 1;
  }
  return { scored, urgent: urgentCount };
}

export async function rescoreAll(): Promise<Record<string, unknown>> {
  const { data: products } = await supabaseAdmin().from("products").select("id, slug");
  const out: Record<string, unknown> = {};
  for (const p of products ?? []) out[p.slug] = await rescoreProduct(p.id);
  return out;
}

const SEV: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rescoreTheme(themeId: string, loaded?: any): Promise<{ urgent: boolean } | { skipped: string }> {
  const db = supabaseAdmin();
  const theme = loaded ?? (await db.from("themes").select("*").eq("id", themeId).single()).data;
  if (!theme) return { skipped: "theme not found" };
  const { data: items } = await db
    .from("feedback")
    .select("received_at, severity, raw_text, author, submitter_email, segment, feature_area, raw_payload")
    .eq("theme_id", themeId);
  const rows = items ?? [];
  const now = Date.now();
  const DAY = 86_400_000;

  const people = new Set(rows.map((r) => (r.submitter_email || r.author || "").toLowerCase()).filter(Boolean)).size || rows.length;
  const schools = new Set(
    rows
      .map((r) => {
        const p = (r.raw_payload ?? {}) as Record<string, unknown>;
        return (typeof p.school === "string" && p.school) || r.segment || null;
      })
      .filter(Boolean),
  ).size;
  const sevs = rows.map((r) => SEV[r.severity ?? ""] ?? 0).filter((n) => n > 0);
  const severity = sevs.length ? sevs.reduce((a, b) => a + b, 0) / sevs.length : 0;
  const age = (r: { received_at: string }) => now - new Date(r.received_at).getTime();
  const last14 = rows.filter((r) => age(r) <= 14 * DAY).length;
  const prev14 = rows.filter((r) => age(r) > 14 * DAY && age(r) <= 28 * DAY).length;

  const { impact } = impactScore({ people, schools, severity, last14, prev14, fitsGoals: Boolean(theme.fits_goals) });
  const u = urgency({
    isClosed: ["fixed", "released", "not_now"].includes(theme.status),
    regressed: Boolean(theme.regressed),
    criticalAt: rows.filter((r) => r.severity === "critical").map((r) => r.received_at),
    riskAt: rows.filter((r) => mentionsRisk(r.raw_text ?? "")).map((r) => r.received_at),
    reportDates: rows.map((r) => r.received_at),
    clearedAt: theme.urgent_cleared_at ?? null,
    fixedAt: theme.fixed_at ?? null,
  });

  const { error } = await db
    .from("themes")
    .update({
      impact,
      urgent: u.urgent,
      urgent_reason: u.reason,
      urgent_since: u.since,
      area: mode(rows.map((r) => r.feature_area)),
      scored_at: new Date().toISOString(),
    })
    .eq("id", themeId);
  if (error) return { skipped: `Run supabase/UPGRADE_TO_V0.4.sql first (${error.message})` };
  return { urgent: u.urgent };
}

/**
 * Pages that show scores call this first: if any issue has never been scored
 * (new sample data, a fresh database) or the last run is over a day old, score
 * now. Cheap when everything is current: one small query.
 */
export async function ensureScored(productId: string): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from("themes")
    .select("scored_at")
    .eq("product_id", productId)
    .gt("frequency", 0)
    .order("scored_at", { ascending: true, nullsFirst: true })
    .limit(1);
  if (error || !data?.length) return; // before migration 0006, or no issues yet
  const oldest = data[0].scored_at ? new Date(data[0].scored_at).getTime() : 0;
  if (Date.now() - oldest > 86_400_000) await rescoreProduct(productId);
}
