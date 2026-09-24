import { getProduct } from "@/lib/product";
import { supabaseRead } from "@/lib/supabase";
import { getStaff } from "@/lib/auth-server";
import { canManage } from "@/lib/ui";
import { undoAction } from "@/app/automation-actions";

export const dynamic = "force-dynamic";

/** NFR-14 audit trail + FR-95 undo. */
export default async function ActivityPage() {
  const product = await getProduct();
  const staff = await getStaff();
  const { data } = await supabaseRead()
    .from("audit_log")
    .select("*")
    .or(`product_id.eq.${product?.id},product_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(200);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-slate-500">Every change people made, newest first. Single changes to items and themes can be undone.</p>
      </div>
      <ul className="card divide-y divide-slate-100">
        {(data ?? []).map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="w-36 shrink-0 text-xs text-slate-500">{new Date(e.created_at).toLocaleString("en-SG")}</span>
            <span className="font-medium">{e.actor}</span>
            <span className={e.undone ? "text-slate-400 line-through" : ""}>{e.action}</span>
            {canManage(staff?.role) && !e.undone && e.before && e.after && ["feedback", "themes"].includes(e.target_table) && (
              <form action={undoAction} className="ml-auto">
                <input type="hidden" name="id" value={e.id} />
                <button className="text-xs text-pulse-600 hover:underline">Undo</button>
              </form>
            )}
          </li>
        ))}
        {(data ?? []).length === 0 && <li className="p-4 text-sm text-slate-500">No activity yet.</li>}
      </ul>
    </div>
  );
}
