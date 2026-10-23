import { EFFORTS, EFFORT_LABEL, IMPACT_LINE, QUADRANT_LABEL } from "@/lib/scoring";
import type { PriorityRow } from "@/lib/priority-queries";

const W = 640;
const H = 420;
const M = { top: 16, right: 16, bottom: 44, left: 48 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;
const BAND = PW / 4;

const TEAL = "#0B6E69";
const GRID = "#E2E5E0";
const MUTED = "#5B6776";

const y = (impact: number) => M.top + ((10 - Math.max(1, Math.min(10, impact))) / 9) * PH;

/**
 * Impact (1–10, up) against effort (S, M, L, XL, across). Each sized,
 * non-urgent issue is a dot, sized by people affected and numbered to match
 * the ranked list. Bugs are filled, features are outlined.
 */
export function Matrix({ rows, rank }: { rows: PriorityRow[]; rank: Map<string, number> }) {
  const placed = rows.filter((r) => r.effort && r.impact != null && !r.urgent);
  const maxPeople = Math.max(1, ...placed.map((r) => r.people));
  const lineY = y(IMPACT_LINE);
  const midX = M.left + 2 * BAND;

  // Spread dots that share an effort band so they don't sit on top of each other.
  const byBand = new Map<string, PriorityRow[]>();
  placed.forEach((r) => byBand.set(r.effort!, [...(byBand.get(r.effort!) ?? []), r]));

  const corner = (text: string, x: number, yy: number, anchor: "start" | "end") => (
    <text x={x} y={yy} textAnchor={anchor} fontSize="13" fontWeight="600" fill={MUTED}>
      {text}
    </text>
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Impact-effort matrix with ${placed.length} issues. The ranked list below has the same issues in order.`}
    >
      <rect x={M.left} y={M.top} width={midX - M.left} height={lineY - M.top} fill="#E3F1EF" />
      <rect x={M.left} y={M.top} width={PW} height={PH} fill="none" stroke={GRID} />
      <line x1={M.left} x2={M.left + PW} y1={lineY} y2={lineY} stroke={MUTED} strokeDasharray="4 4" />
      <line x1={midX} x2={midX} y1={M.top} y2={M.top + PH} stroke={MUTED} strokeDasharray="4 4" />
      {corner(QUADRANT_LABEL.quick_win, M.left + 10, M.top + 20, "start")}
      {corner(QUADRANT_LABEL.big_bet, M.left + PW - 10, M.top + 20, "end")}
      {corner(QUADRANT_LABEL.fill_in, M.left + 10, M.top + PH - 10, "start")}
      {corner(QUADRANT_LABEL.not_worth_it, M.left + PW - 10, M.top + PH - 10, "end")}

      {[1, 4, IMPACT_LINE, 8, 10].map((v) => (
        <text key={v} x={M.left - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill={MUTED}>
          {v}
        </text>
      ))}
      <text x={14} y={M.top + PH / 2} fontSize="12" fill={MUTED} transform={`rotate(-90 14 ${M.top + PH / 2})`} textAnchor="middle">
        Impact
      </text>
      {EFFORTS.map((e, i) => (
        <text key={e} x={M.left + BAND * i + BAND / 2} y={M.top + PH + 20} textAnchor="middle" fontSize="13" fontWeight="600" fill={MUTED}>
          {EFFORT_LABEL[e]}
        </text>
      ))}
      <text x={M.left + PW / 2} y={H - 4} textAnchor="middle" fontSize="12" fill={MUTED}>
        Effort
      </text>

      {EFFORTS.map((e, bi) => {
        const list = (byBand.get(e) ?? []).slice().sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0));
        const step = Math.min(30, (BAND * 0.8) / Math.max(1, list.length));
        return list.map((r, k) => {
          const cx = M.left + BAND * bi + BAND / 2 + (k - (list.length - 1) / 2) * step;
          const cy = y(r.impact!);
          const rad = 7 + 9 * Math.sqrt(r.people / maxPeople);
          const n = rank.get(r.theme.id);
          const bug = r.theme.category === "bug";
          return (
            <a key={r.theme.id} href={`/themes/${r.theme.id}`}>
              <title>{`${n}. ${r.theme.label}: impact ${r.impact}, effort ${EFFORT_LABEL[r.effort!]}, ${r.people} people`}</title>
              <circle cx={cx} cy={cy} r={rad} fill={bug ? TEAL : "#FFFFFF"} stroke={TEAL} strokeWidth={2.5} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={bug ? "#FFFFFF" : TEAL}>
                {n}
              </text>
            </a>
          );
        });
      })}
    </svg>
  );
}
