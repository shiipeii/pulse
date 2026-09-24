import Link from "next/link";
import { getProduct } from "@/lib/product";
import { getSourceRegister } from "@/lib/queries";
import { getStaff } from "@/lib/auth-server";
import { canManage } from "@/lib/ui";
import { addSource, updateSource, deleteSource } from "@/app/admin-actions";

export const dynamic = "force-dynamic";

const KINDS = ["form", "formsg", "email", "mailbox", "survey", "helpdesk", "escalation", "chat", "other"];
const STATUS_TEXT: Record<string, string> = { connected: "Connected", imported: "Imported", not_connected: "Not connected yet" };
const STATUS_CLASS: Record<string, string> = {
  connected: "bg-emerald-100 text-emerald-700",
  imported: "bg-sky-50 text-sky-700",
  not_connected: "bg-red-50 text-red-700",
};

/**
 * FR-90 source register + FR-97 progress to one channel. The goal is 100% of
 * known sources connected or imported, so no feedback is invisible.
 */
export default async function SourcesPage() {
  const product = await getProduct();
  if (!product) return <p className="card p-6 text-sm">No product found.</p>;
  const staff = await getStaff();
  const manage = canManage(staff?.role);
  const reg = await getSourceRegister(product.id);
  const maxMonth = Math.max(1, ...reg.months.map((m) => m.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Feedback sources</h1>
          <p className="text-sm text-slate-500">
            Every place feedback arrives, connected or not. Goal: 100% connected or imported.
          </p>
        </div>
        <Link href="/import" className="rounded-lg bg-pulse-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pulse-700">
          Import a file
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs text-slate-500">Source coverage</div>
          <div className="text-2xl font-semibold">{reg.coverage}%</div>
          <div className="text-xs text-slate-500">{reg.rows.filter((r) => r.status !== "not_connected").length} of {reg.rows.length} sources</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Feedback in the last 6 months</div>
          <div className="text-2xl font-semibold">{reg.total}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Through Pulse&apos;s own form (end state: 100%)</div>
          <div className="text-2xl font-semibold">
            {reg.total ? Math.round((reg.months.reduce((a, m) => a + m.native, 0) / reg.total) * 100) : 0}%
          </div>
        </div>
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Moving to one channel</h2>
        <p className="text-xs text-slate-500">Share of each month&apos;s feedback that came through Pulse&apos;s own form (dark) vs other sources (light).</p>
        <div className="flex h-32 items-end gap-3" role="img" aria-label="Monthly feedback by channel type">
          {reg.months.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end" style={{ height: 104 }}>
                <div className="w-full rounded-t bg-pulse-50" style={{ height: `${((m.total - m.native) / maxMonth) * 104}px` }} />
                <div className="w-full bg-pulse-600" style={{ height: `${(m.native / maxMonth) * 104}px` }} />
              </div>
              <span className="text-xs text-slate-500">{m.label}</span>
              <span className="text-[10px] text-slate-400">{m.total ? Math.round((m.native / m.total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Source</th>
              <th className="p-3">Kind</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Status</th>
              <th className="p-3">Items (6 mo)</th>
              <th className="p-3">Share</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {reg.rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3">
                  <div className="font-medium">{r.name}</div>
                  {r.notes && <div className="text-xs text-slate-500">{r.notes}</div>}
                </td>
                <td className="p-3 text-xs">{r.kind}</td>
                <td className="p-3">
                  {manage ? (
                    <form action={updateSource} className="flex gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="owner" defaultValue={r.owner ?? ""} placeholder="Owner" className="w-28 rounded border border-slate-300 px-1.5 py-0.5 text-xs" />
                      <button className="text-xs text-pulse-600">Save</button>
                    </form>
                  ) : (
                    r.owner ?? "–"
                  )}
                </td>
                <td className="p-3">
                  {manage && !r.channel_id ? (
                    <form action={updateSource} className="flex gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <select name="status" defaultValue={r.status} className="rounded border border-slate-300 px-1 py-0.5 text-xs">
                        <option value="not_connected">Not connected yet</option>
                        <option value="imported">Imported</option>
                        <option value="connected">Connected</option>
                      </select>
                      <button className="text-xs text-pulse-600">Save</button>
                    </form>
                  ) : (
                    <span className={`badge ${STATUS_CLASS[r.status]}`}>{STATUS_TEXT[r.status]}</span>
                  )}
                </td>
                <td className="p-3">{r.items}</td>
                <td className="p-3">{reg.total ? `${Math.round((r.items / reg.total) * 100)}%` : "–"}</td>
                <td className="p-3 text-right">
                  {manage && !r.channel_id && (
                    <form action={deleteSource}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-slate-500 hover:text-rose-600">Remove</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {reg.rows.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-slate-500">No sources yet. Add every place feedback arrives today.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {manage && (
        <form action={addSource} className="card grid gap-3 p-5 sm:grid-cols-5">
          <h2 className="font-semibold sm:col-span-5">Add a source to the register</h2>
          <input name="name" required placeholder="e.g. Termly teacher survey" className="rounded-lg border border-slate-300 p-2 text-sm sm:col-span-2" />
          <select name="kind" defaultValue="survey" className="rounded-lg border border-slate-300 p-2 text-sm">
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input name="owner" placeholder="Owner" className="rounded-lg border border-slate-300 p-2 text-sm" />
          <button className="rounded-lg bg-pulse-600 px-3 py-2 text-sm font-medium text-white hover:bg-pulse-700">Add</button>
          <input name="notes" placeholder="Notes (optional): where it lives, how often it arrives" className="rounded-lg border border-slate-300 p-2 text-sm sm:col-span-5" />
        </form>
      )}
    </div>
  );
}
