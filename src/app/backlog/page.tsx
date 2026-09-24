import Link from "next/link";
import { getProduct } from "@/lib/product";
import { getBacklog } from "@/lib/queries";
import { CategoryBadge } from "@/components/badges";
import { STATUS_LABEL, STATUS_STYLE, trend } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * FR-92: one ranked list of every open bug and feature, with evidence.
 * Score = people × severity (bugs) or people × 2 (features).
 */
export default async function BacklogPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const product = await getProduct(searchParams.product);
  if (!product) return <p className="card p-6 text-sm">No product found.</p>;
  const kind = searchParams.kind ?? "all";
  const show = searchParams.show ?? "open";
  const owner = (searchParams.owner ?? "").toLowerCase();

  const all = await getBacklog(product.id);
  const closed = (s: string) => ["fixed", "released", "not_now"].includes(s);
  const rows = all.filter(
    (r) =>
      (kind === "all" || r.theme.category === kind) &&
      (show === "all" || (show === "open" ? !closed(r.theme.status) : closed(r.theme.status))) &&
      (!owner || (r.theme.owner ?? "").toLowerCase().includes(owner)),
  );
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ kind, show, ...(owner ? { owner } : {}), ...patch });
    return `/backlog?${p.toString()}`;
  };
  const chip = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-pulse-600 bg-pulse-50 font-medium text-pulse-700" : "border-slate-300 bg-white text-slate-600"}`}>
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prioritised backlog</h1>
          <p className="text-sm text-slate-500">Every bug to fix and feature to consider, ranked by evidence. {rows.length} shown.</p>
        </div>
        <a href={`/api/export/backlog?kind=${kind}&show=${show}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          Export CSV
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chip(qs({ kind: "all" }), "Bugs + features", kind === "all")}
        {chip(qs({ kind: "bug" }), "Bugs", kind === "bug")}
        {chip(qs({ kind: "feature" }), "Features", kind === "feature")}
        <span className="mx-2 h-4 w-px bg-slate-300" />
        {chip(qs({ show: "open" }), "Open", show === "open")}
        {chip(qs({ show: "closed" }), "Closed", show === "closed")}
        {chip(qs({ show: "all" }), "All", show === "all")}
        <form action="/backlog" className="ml-auto flex items-center gap-2 text-xs">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="show" value={show} />
          <input name="owner" defaultValue={owner} placeholder="Filter by owner" className="rounded-lg border border-slate-300 px-2 py-1" />
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Theme</th>
              <th className="p-3">People</th>
              <th className="p-3">Reports</th>
              <th className="p-3">Trend</th>
              <th className="p-3">Severity</th>
              <th className="p-3">Channels</th>
              <th className="p-3">Status</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Ticket</th>
              <th className="p-3" title="People × severity for bugs; people × 2 for features">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.theme.id} className="border-t border-slate-100 align-top">
                <td className="p-3 text-slate-400">{i + 1}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <CategoryBadge value={r.theme.category} />
                    <Link href={`/themes/${r.theme.id}`} className="font-medium hover:text-pulse-700">{r.theme.label}</Link>
                    {r.theme.regressed && <span className="badge bg-red-100 text-red-700">regression</span>}
                  </div>
                </td>
                <td className="p-3">{r.stats?.reporters ?? r.theme.frequency}</td>
                <td className="p-3">{r.stats?.items ?? r.theme.frequency}</td>
                <td className="p-3 text-xs text-slate-500">{trend(r.stats?.last7, r.stats?.prev7)}</td>
                <td className="p-3">{r.theme.category === "bug" ? Number(r.theme.severity_score).toFixed(1) : "–"}</td>
                <td className="p-3">{r.stats?.channels ?? 1}</td>
                <td className="p-3"><span className={`badge ${STATUS_STYLE[r.theme.status]}`}>{STATUS_LABEL[r.theme.status]}</span></td>
                <td className="p-3 text-xs">{r.theme.owner ?? <span className="text-slate-400">–</span>}</td>
                <td className="p-3 text-xs">
                  {r.ticket?.status === "filed" ? (
                    r.ticket.url ? <a href={r.ticket.url} target="_blank" rel="noreferrer" className="text-pulse-600 hover:underline">{r.ticket.jira_key}</a> : r.ticket.jira_key
                  ) : r.ticket?.status === "draft" ? (
                    <span className="badge bg-amber-100 text-amber-800">draft</span>
                  ) : (
                    <span className="text-slate-400">–</span>
                  )}
                </td>
                <td className="p-3 font-semibold">{r.score.toFixed(0)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={11} className="p-6 text-center text-slate-500">Nothing here yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
