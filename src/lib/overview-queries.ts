import { supabaseRead } from "./supabase";
import { getPriorityRows, type PriorityRow } from "./priority-queries";
import { getDecisionRate, type DecisionRate } from "./home-queries";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

export interface FrequentRow extends PriorityRow {
  prev14: number;
}

export interface AreaRow {
  area: string;
  open: number;
  urgent: number;
  /** Sum of impact across the area's open issues. */
  impact: number;
}

export interface Overview {
  rows: PriorityRow[];
  urgent: PriorityRow[];
  quickWins: PriorityRow[];
  frequent: FrequentRow[];
  areas: AreaRow[];
  open: number;
  newIssues: number;
  reports14: number;
  reportsPrev14: number;
  rate: DecisionRate;
  fixes: { total: number; held: number };
}

/**
 * Everything the Overview (issue #4) shows: urgent issues, quick wins, the
 * most frequent issues over 14 days, and product areas ranked by impact.
 */
export async function getOverview(productId: string): Promise<Overview> {
  const db = supabaseRead();
  const [rows, rate, { data: recent }, { data: fixed }] = await Promise.all([
    getPriorityRows(productId),
    getDecisionRate(productId),
    db.from("feedback").select("theme_id, received_at").eq("product_id", productId).gte("received_at", ago(28)).limit(50000),
    db.from("themes").select("id, regressed").eq("product_id", productId).gte("fixed_at", ago(90)),
  ]);

  const cut = Date.now() - 14 * DAY;
  const prev14 = new Map<string, number>();
  let reports14 = 0;
  let reportsPrev14 = 0;
  for (const r of recent ?? []) {
    if (new Date(r.received_at).getTime() >= cut) reports14 += 1;
    else {
      reportsPrev14 += 1;
      if (r.theme_id) prev14.set(r.theme_id, (prev14.get(r.theme_id) ?? 0) + 1);
    }
  }

  const urgent = rows.filter((r) => r.urgent);
  const quickWins = rows.filter((r) => r.quadrant === "quick_win" && !r.urgent && r.decision !== "not_now").slice(0, 5);
  const frequent = rows
    .filter((r) => r.last14 > 0)
    .map((r) => ({ ...r, prev14: prev14.get(r.theme.id) ?? 0 }))
    .sort((a, b) => b.last14 - a.last14 || b.people - a.people)
    .slice(0, 5);

  const byArea = new Map<string, AreaRow>();
  for (const r of rows) {
    const key = r.theme.area || "No area yet";
    const a = byArea.get(key) ?? { area: key, open: 0, urgent: 0, impact: 0 };
    a.open += 1;
    if (r.urgent) a.urgent += 1;
    a.impact += r.impact ?? 0;
    byArea.set(key, a);
  }
  const areas = Array.from(byArea.values())
    .map((a) => ({ ...a, impact: Math.round(a.impact * 10) / 10 }))
    .sort((a, b) => b.impact - a.impact);

  const fixedRows = fixed ?? [];
  return {
    rows,
    urgent,
    quickWins,
    frequent,
    areas,
    open: rows.length,
    newIssues: rows.filter((r) => new Date(r.theme.created_at).getTime() >= cut).length,
    reports14,
    reportsPrev14,
    rate,
    fixes: { total: fixedRows.length, held: fixedRows.filter((t) => !t.regressed).length },
  };
}
