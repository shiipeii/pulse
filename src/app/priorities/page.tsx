import Link from "next/link";
import { getProduct } from "@/lib/product";
import { getStaff } from "@/lib/auth-server";
import { getPriorityRows, areasOf, type PriorityRow } from "@/lib/priority-queries";
import { DECISION_LABEL, DECISIONS, EFFORT_HINT, EFFORT_LABEL, QUADRANT_SHORT, type Decision } from "@/lib/scoring";
import { Matrix } from "@/components/priorities/Matrix";
import { DecisionPicker } from "@/components/priorities/DecisionPicker";
import { EffortButtons } from "@/components/priorities/EffortButtons";
import { clearUrgent } from "@/app/priority-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Priorities (issue #3): every open bug and feature placed by impact and
 * effort, a ranked list, the Needs sizing tray and the decision board.
 * Urgent issues skip the matrix into Act now.
 */
export default async function PrioritiesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const product = await getProduct(searchParams.product);
  if (!product) return <p className="card p-6 text-sm">No product found.</p>;
  const staff = await getStaff();
  const canDecide = staff?.role === "admin" || staff?.role === "pm";
  const canSize = canDecide || staff?.role === "engineer";

  const kind = searchParams.kind === "bug" || searchParams.kind === "feature" ? searchParams.kind : undefined;
  const area = searchParams.area || undefined;
  const all = await getPriorityRows(product.id);
  const rows = all.filter((r) => (!kind || r.theme.category === kind) && (!area || r.theme.area === area));
  const areas = areasOf(all);

  const urgent = rows.filter((r) => r.urgent);
  const unsized = rows.filter((r) => !r.effort);
  const ranked = rows.filter((r) => r.priority != null && !r.urgent);
  const rank = new Map(ranked.map((r, i) => [r.theme.id, i + 1]));
  const counts = Object.fromEntries(DECISIONS.map((d) => [d, rows.filter((r) => r.decision === d).length])) as Record<Decision, number>;
  const undecided = rows.filter((r) => !r.decision);
  const undecidedWins = undecided.filter((r) => r.quadrant === "quick_win").length;
  const nextUp = ranked.find((r) => !r.decision) ?? undecided[0];

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { kind, area, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/priorities?${s}` : "/priorities";
  };
  const chip = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-pulse-600 bg-pulse-50 font-semibold text-pulse-700" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Priorities</h1>
        <p className="text-slate-600">
          {rows.length} open {rows.length === 1 ? "issue" : "issues"} placed by impact and effort.
          {urgent.length > 0 && ` ${urgent.length} urgent ${urgent.length === 1 ? "issue is" : "issues are"} in Act now.`}
          {unsized.length > 0 && ` ${unsized.length} ${unsized.length === 1 ? "needs" : "need"} sizing.`}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {chip(qs({ kind: undefined }), "All", !kind)}
        {chip(qs({ kind: "bug" }), "Bugs", kind === "bug")}
        {chip(qs({ kind: "feature" }), "Features", kind === "feature")}
        {areas.length > 0 && (
          <form action="/priorities" className="ml-auto flex items-center gap-2">
            {kind && <input type="hidden" name="kind" value={kind} />}
            <label htmlFor="area" className="text-sm text-slate-600">
              Product area
            </label>
            <select id="area" name="area" defaultValue={area ?? ""} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm">
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50">Show</button>
          </form>
        )}
      </div>

      {urgent.length > 0 && (
        <section aria-labelledby="act-now" className="rounded-xl border border-[#F3C5BF] bg-[#FDF3F1] p-5">
          <h2 id="act-now" className="font-semibold text-[#8F1D12]">
            Act now
          </h2>
          <p className="text-sm text-[#8F1D12]">Urgent issues skip the matrix. Decide on these first.</p>
          <ul className="mt-3 space-y-2">
            {urgent.map((r) => (
              <li key={r.theme.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3">
                <div className="min-w-[14rem] flex-1">
                  <Link href={`/themes/${r.theme.id}`} className="font-medium text-ink hover:text-pulse-700 hover:underline">
                    {r.theme.label}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {r.theme.urgent_reason} · {r.people} people · impact {r.impact ?? "–"}
                  </p>
                </div>
                {canDecide && <DecisionPicker id={r.theme.id} value={r.decision} label={r.theme.label} />}
                {canDecide && (
                  <form action={clearUrgent}>
                    <input type="hidden" name="id" value={r.theme.id} />
                    <button className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" title="It comes back only if a new urgent signal arrives">
                      Not urgent
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <section className="card p-8 text-center">
          <h2 className="font-semibold">No open issues</h2>
          <p className="mt-1 text-sm text-slate-600">
            {kind || area ? "Nothing matches these filters." : "Once feedback comes in and is grouped, issues appear here."}{" "}
            {!kind && !area && (
              <Link href="/sources" className="text-pulse-700 underline">
                Check your sources
              </Link>
            )}
          </p>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section aria-labelledby="matrix" className="card p-5 lg:col-span-3">
            <h2 id="matrix" className="font-semibold">
              Impact against effort
            </h2>
            <p className="text-sm text-slate-600">
              Dot size is people affected; numbers match the ranked list. Filled dots are bugs, outlined dots are features.
            </p>
            <div className="mt-3">
              <Matrix rows={rows} rank={rank} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              S {EFFORT_HINT.s}, M {EFFORT_HINT.m}, L {EFFORT_HINT.l}, XL {EFFORT_HINT.xl}.
            </p>
          </section>

          <div className="space-y-6 lg:col-span-2">
            <section aria-labelledby="board" className="card p-5">
              <h2 id="board" className="font-semibold">
                Decisions
              </h2>
              <p className="text-sm text-slate-600">Every open issue should end up in one of these.</p>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {DECISIONS.map((d) => (
                  <div key={d} className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-sm text-slate-600">{DECISION_LABEL[d]}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{counts[d]}</dd>
                  </div>
                ))}
              </dl>
              {undecided.length > 0 ? (
                <p className="mt-3 text-sm text-slate-700">
                  <strong>{undecided.length}</strong> still {undecided.length === 1 ? "needs" : "need"} a decision
                  {undecidedWins > 0 && `, including ${undecidedWins} quick ${undecidedWins === 1 ? "win" : "wins"}`}.{" "}
                  {nextUp && (
                    <Link href={`/themes/${nextUp.theme.id}`} className="font-medium text-pulse-700 underline">
                      Decide the next one
                    </Link>
                  )}
                </p>
              ) : (
                <p className="mt-3 text-sm text-slate-700">Every open issue has a decision.</p>
              )}
            </section>

            <section aria-labelledby="sizing" className="card p-5">
              <h2 id="sizing" className="font-semibold">
                Needs sizing · {unsized.length}
              </h2>
              <p className="text-sm text-slate-600">These can&apos;t go on the matrix until someone sizes the effort.</p>
              {unsized.length === 0 ? (
                <p className="mt-3 text-sm text-slate-700">Everything is sized.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {unsized.map((r) => (
                    <li key={r.theme.id} className="space-y-2 rounded-lg bg-slate-50 p-3">
                      <div>
                        <Link href={`/themes/${r.theme.id}`} className="font-medium hover:text-pulse-700 hover:underline">
                          {r.theme.label}
                        </Link>
                        <p className="text-sm text-slate-600">
                          {r.theme.category === "bug" ? "Bug" : "Feature"} · impact {r.impact ?? "–"} ·{" "}
                          {r.theme.owner ? `owner ${r.theme.owner}` : "no owner yet"}
                        </p>
                      </div>
                      {canSize && <EffortButtons id={r.theme.id} value={null} label={r.theme.label} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {ranked.length > 0 && (
        <section aria-labelledby="ranked" className="card p-5">
          <h2 id="ranked" className="font-semibold">
            Ranked by priority
          </h2>
          <p className="text-sm text-slate-600">Priority = impact ÷ effort (S 1, M 2, L 4, XL 8). Quick, high-impact work rises to the top.</p>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Issue</th>
                  <th className="py-2 pr-3 text-right font-medium">Impact</th>
                  <th className="py-2 pr-3 font-medium">Effort</th>
                  <th className="py-2 pr-3 text-right font-medium">Priority</th>
                  <th className="py-2 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <RankedRow key={r.theme.id} r={r} n={i + 1} canDecide={canDecide} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function RankedRow({ r, n, canDecide }: { r: PriorityRow; n: number; canDecide: boolean }) {
  return (
    <tr className="border-b border-slate-100 align-middle last:border-0">
      <td className="py-3 pr-3 text-slate-500 tabular-nums">{n}</td>
      <td className="py-3 pr-3">
        <Link href={`/themes/${r.theme.id}`} className="font-medium text-ink hover:text-pulse-700 hover:underline">
          {r.theme.label}
        </Link>
        <p className="text-slate-600">
          {r.quadrant ? QUADRANT_SHORT[r.quadrant] : ""} · {r.theme.category === "bug" ? "Bug" : "Feature"} · {r.people}{" "}
          {r.people === 1 ? "person" : "people"}
          {r.theme.area ? ` · ${r.theme.area}` : ""}
        </p>
      </td>
      <td className="py-3 pr-3 text-right tabular-nums">{r.impact}</td>
      <td className="py-3 pr-3">
        <span className="badge bg-slate-100 text-slate-700" title={r.theme.effort_source === "ai" ? "AI guess" : r.theme.effort_set_by ? `Set by ${r.theme.effort_set_by}` : undefined}>
          {r.effort ? EFFORT_LABEL[r.effort] : "–"}
        </span>
      </td>
      <td className="py-3 pr-3 text-right font-semibold tabular-nums">{r.priority}</td>
      <td className="py-3">
        {canDecide ? (
          <DecisionPicker id={r.theme.id} value={r.decision} label={r.theme.label} />
        ) : (
          <span className="text-slate-700">{r.decision ? DECISION_LABEL[r.decision] : "Not decided"}</span>
        )}
      </td>
    </tr>
  );
}
