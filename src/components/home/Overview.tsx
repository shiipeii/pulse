import Link from "next/link";
import type { Overview as OverviewData } from "@/lib/overview-queries";
import { EFFORT_LABEL } from "@/lib/scoring";
import { DecisionPicker } from "@/components/priorities/DecisionPicker";
import { clearUrgent } from "@/app/priority-actions";
import { Stat, Section, Empty } from "./parts";

const kindLabel = (c: string) => (c === "bug" ? "Bug" : "Feature");

function change(now: number, before: number): { text: string; tone: string } {
  if (before === 0) return now > 0 ? { text: "new", tone: "text-amber-700" } : { text: "–", tone: "text-slate-400" };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: "same", tone: "text-slate-500" };
  return pct > 0 ? { text: `↑ ${pct}%`, tone: "text-amber-700" } : { text: `↓ ${Math.abs(pct)}%`, tone: "text-emerald-700" };
}

/**
 * The Overview (issue #4): what needs acting on now, quick wins, what comes
 * up most often, and which product areas carry the most impact.
 * `canAct` shows decision controls (PM and admin). Leadership gets the same
 * view read-only; it shows issue names and counts, never people.
 */
export function Overview({ data, canAct }: { data: OverviewData; canAct: boolean }) {
  const reportChange = change(data.reports14, data.reportsPrev14);
  const maxArea = Math.max(1, ...data.areas.map((a) => a.impact));
  const maxFreq = Math.max(1, ...data.frequent.map((f) => Math.max(f.last14, f.prev14)));

  return (
    <div className="space-y-8">
      {data.urgent.length === 0 ? (
        <section aria-labelledby="act-now" className="card flex items-center gap-3 border-emerald-200 bg-emerald-50 p-4">
          <span aria-hidden className="text-lg">✓</span>
          <div>
            <h2 id="act-now" className="font-semibold text-emerald-900">Nothing urgent</h2>
            <p className="text-sm text-emerald-800">No critical reports, regressions, data-loss mentions or spikes right now.</p>
          </div>
        </section>
      ) : (
        <section aria-labelledby="act-now" className="rounded-xl border border-[#F3C5BF] bg-[#FDF3F1] p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="act-now" className="font-semibold text-[#8F1D12]">
                Act now · {data.urgent.length}
              </h2>
              <p className="text-sm text-[#8F1D12]">Urgent issues, newest first. Each says why it was flagged.</p>
            </div>
            {canAct && (
              <Link href="/priorities" className="text-sm font-medium text-[#8F1D12] hover:underline">
                All priorities →
              </Link>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {data.urgent
              .slice()
              .sort((a, b) => (b.theme.urgent_since ?? "").localeCompare(a.theme.urgent_since ?? ""))
              .map((r) => (
                <li key={r.theme.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3">
                  <div className="min-w-[14rem] flex-1">
                    <Link href={`/themes/${r.theme.id}`} className="font-medium text-ink hover:text-pulse-700 hover:underline">
                      {r.theme.label}
                    </Link>
                    <p className="text-sm text-slate-600">
                      {kindLabel(r.theme.category)} · {r.theme.urgent_reason} · {r.people} people
                    </p>
                  </div>
                  {canAct && <DecisionPicker id={r.theme.id} value={r.decision} label={r.theme.label} />}
                  {canAct && (
                    <form action={clearUrgent}>
                      <input type="hidden" name="id" value={r.theme.id} />
                      <button
                        className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
                        title="It comes back only if a new urgent signal arrives"
                      >
                        Not urgent
                      </button>
                    </form>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open issues" value={data.open} note={`${data.rows.filter((r) => !r.effort).length} still need sizing`} />
        <Stat
          label="Reports in the last 14 days"
          value={data.reports14}
          note={`${reportChange.text === "–" ? "No earlier reports" : `${reportChange.text} vs the 14 days before`} · ${data.newIssues} new ${data.newIssues === 1 ? "issue" : "issues"}`}
        />
        <Stat
          label="Decided within 14 days"
          value={data.rate.rate == null ? "–" : `${data.rate.rate}%`}
          note={data.rate.total ? `${data.rate.decided} of ${data.rate.total} reports · target 85%` : "Not enough reports yet · target 85%"}
          tone={data.rate.rate == null ? undefined : data.rate.rate >= 85 ? "good" : "warn"}
        />
        <Stat
          label="Fixes that held"
          value={data.fixes.total ? `${data.fixes.held} of ${data.fixes.total}` : "–"}
          note={data.fixes.total ? "Fixed in 90 days and not reported again" : "No fixes in the last 90 days"}
          tone={data.fixes.total && data.fixes.held < data.fixes.total ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section
          title="Quick wins"
          subtitle="High impact, little work. Usually the best next pick."
          action={
            canAct ? (
              <Link href="/priorities" className="text-sm text-pulse-600 hover:underline">
                See the matrix →
              </Link>
            ) : undefined
          }
        >
          {data.quickWins.length === 0 ? (
            <Empty>No quick wins yet. They appear once issues are sized.</Empty>
          ) : (
            <ol className="card divide-y divide-slate-100">
              {data.quickWins.map((r, i) => (
                <li key={r.theme.id} className="flex items-center gap-3 p-3 text-sm">
                  <span className="w-5 text-right font-semibold text-slate-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/themes/${r.theme.id}`} className="font-medium hover:text-pulse-700">
                      {r.theme.label}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {kindLabel(r.theme.category)} · impact {r.impact} · effort {r.effort ? EFFORT_LABEL[r.effort] : "–"} · {r.people} people
                    </p>
                  </div>
                  {r.decision ? (
                    <span className="badge bg-pulse-50 text-pulse-700">Decided</span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-800">Undecided</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Most frequent" subtitle="Reports in the last 14 days, against the 14 days before">
          {data.frequent.length === 0 ? (
            <Empty>No reports in the last 14 days.</Empty>
          ) : (
            <ol className="card divide-y divide-slate-100">
              {data.frequent.map((r) => {
                const c = change(r.last14, r.prev14);
                return (
                  <li key={r.theme.id} className="p-3 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/themes/${r.theme.id}`} className="min-w-0 font-medium hover:text-pulse-700">
                        {r.theme.label}
                      </Link>
                      <span className={`shrink-0 text-xs font-medium ${c.tone}`}>{c.text}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2" role="img" aria-label={`${r.last14} reports in the last 14 days, ${r.prev14} in the 14 before`}>
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-pulse-600" style={{ width: `${(r.last14 / maxFreq) * 100}%` }} />
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-right text-xs text-slate-500">
                        {r.last14} now · {r.prev14} before
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>

      <Section title="Product areas" subtitle="Ranked by the total impact of their open issues">
        {data.areas.length === 0 ? (
          <Empty>No open issues yet.</Empty>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {data.areas.map((a) => (
              <li key={a.area} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 p-3 text-sm">
                <span className="truncate font-medium">{a.area}</span>
                <div className="h-2 rounded-full bg-slate-100" role="img" aria-label={`Total impact ${a.impact}`}>
                  <div className="h-2 rounded-full bg-pulse-600" style={{ width: `${(a.impact / maxArea) * 100}%` }} />
                </div>
                <span className="text-right text-xs text-slate-500">
                  {a.open} open{a.urgent > 0 && <span className="font-medium text-[#8F1D12]"> · {a.urgent} urgent</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
