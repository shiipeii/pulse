import { getProduct } from "@/lib/product";
import { supabaseRead } from "@/lib/supabase";
import { getStaff } from "@/lib/auth-server";
import { emailConfigured } from "@/lib/email";
import { canManage } from "@/lib/ui";
import { generateReportNow } from "@/app/automation-actions";
import { ReportEditor } from "./ReportEditor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** FR-94: weekly digest and monthly readout, drafted automatically and sent in one click. */
export default async function ReportsPage() {
  const product = await getProduct();
  if (!product) return <p className="card p-6 text-sm">No product found.</p>;
  const staff = await getStaff();
  const manage = canManage(staff?.role);
  const { data: reports } = await supabaseRead()
    .from("reports")
    .select("*")
    .eq("product_id", product.id)
    .order("period_start", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-slate-500">
            Drafted automatically every Monday (weekly) and on the 1st (monthly), 6am Singapore time. Review, then send in one click.
            {!emailConfigured() && " Email isn't set up yet, so copy the text to send it yourself."}
          </p>
        </div>
        {manage && (
          <div className="flex gap-2">
            {(["weekly", "monthly"] as const).map((k) => (
              <form key={k} action={generateReportNow}>
                <input type="hidden" name="kind" value={k} />
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Draft {k} now</button>
              </form>
            ))}
          </div>
        )}
      </div>
      {(reports ?? []).length === 0 && <p className="card p-6 text-sm text-slate-500">No reports yet.</p>}
      {(reports ?? []).map((r) => (
        <ReportEditor key={r.id} report={r} canAct={manage} />
      ))}
    </div>
  );
}
