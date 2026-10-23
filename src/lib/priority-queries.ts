import { supabaseRead } from "./supabase";
import { ensureScored } from "./scoring-run";
import { isDecision, isEffort, priority, quadrant, type Decision, type Effort, type Quadrant } from "./scoring";
import type { Theme, ThemeStats } from "./types";

/** One open issue as the prioritisation screens see it. */
export interface PriorityRow {
  theme: Theme;
  people: number;
  reports: number;
  last14: number;
  impact: number | null;
  effort: Effort | null;
  decision: Decision | null;
  urgent: boolean;
  priority: number | null;
  quadrant: Quadrant | null;
}

export interface PriorityFilters {
  kind?: "bug" | "feature";
  area?: string;
}

/** Statuses that mean the issue is finished, so it leaves the matrix. */
const DONE = ["fixed", "released"];

/**
 * Every open bug and feature with its four signals, sorted by priority
 * (unsized issues last, by impact). Scores are refreshed first if stale.
 */
export async function getPriorityRows(productId: string, f: PriorityFilters = {}): Promise<PriorityRow[]> {
  await ensureScored(productId);
  const db = supabaseRead();
  const [{ data: themes }, { data: stats }, { data: recent }] = await Promise.all([
    db.from("themes").select("*").eq("product_id", productId).gt("frequency", 0).in("category", ["bug", "feature"]),
    db.from("theme_stats").select("*").eq("product_id", productId),
    db
      .from("feedback")
      .select("theme_id")
      .eq("product_id", productId)
      .gte("received_at", new Date(Date.now() - 14 * 86_400_000).toISOString()),
  ]);
  const byTheme = new Map(((stats as ThemeStats[]) ?? []).map((s) => [s.theme_id, s]));
  const last14 = new Map<string, number>();
  (recent ?? []).forEach((r) => r.theme_id && last14.set(r.theme_id, (last14.get(r.theme_id) ?? 0) + 1));

  return ((themes as Theme[]) ?? [])
    .filter((t) => !DONE.includes(t.status))
    .filter((t) => !f.kind || t.category === f.kind)
    .filter((t) => !f.area || (t.area ?? "") === f.area)
    .map((t) => {
      const s = byTheme.get(t.id);
      const effort = isEffort(t.effort) ? t.effort : null;
      const impact = t.impact == null ? null : Number(t.impact);
      const decision = isDecision(t.decision) ? t.decision : t.status === "not_now" ? "not_now" : null;
      return {
        theme: t,
        people: s?.reporters ?? t.frequency,
        reports: s?.items ?? t.frequency,
        last14: last14.get(t.id) ?? 0,
        impact,
        effort,
        decision,
        urgent: Boolean(t.urgent),
        priority: priority(impact, effort),
        quadrant: impact != null && effort ? quadrant(impact, effort) : null,
      };
    })
    .sort((a, b) => {
      if (a.priority != null && b.priority != null) return b.priority - a.priority || (b.impact ?? 0) - (a.impact ?? 0);
      if (a.priority != null) return -1;
      if (b.priority != null) return 1;
      return (b.impact ?? 0) - (a.impact ?? 0);
    });
}

/** Product areas that have open issues, for the filter. */
export function areasOf(rows: PriorityRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.theme.area).filter(Boolean) as string[])).sort();
}
