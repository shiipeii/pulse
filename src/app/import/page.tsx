import { getProduct } from "@/lib/product";
import { supabaseRead } from "@/lib/supabase";
import { ImportWizard } from "./ImportWizard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function ImportPage() {
  const product = await getProduct();
  if (!product) return <p className="card p-6 text-sm">No product found.</p>;
  const { data: sources } = await supabaseRead()
    .from("sources")
    .select("id, name, kind, import_mapping, channel_id")
    .eq("product_id", product.id)
    .order("name");
  const importable = (sources ?? []).filter((s) => !s.channel_id || s.import_mapping && Object.keys(s.import_mapping).length > 0);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Import feedback</h1>
        <p className="text-sm text-slate-500">
          For sources that can&apos;t connect directly yet, like survey or help-desk exports. Upload a CSV or Excel file, match the columns once, and Pulse remembers them next time.
        </p>
      </div>
      <ImportWizard sources={importable.map((s) => ({ id: s.id, name: s.name, mapping: s.import_mapping ?? {} }))} />
    </div>
  );
}
