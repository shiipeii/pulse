import { getProduct } from "@/lib/product";
import { supabaseRead } from "@/lib/supabase";
import { AddChannelWizard } from "./AddChannelWizard";
import { SeedDemoButton } from "./SeedDemoButton";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const product = await getProduct(searchParams.product);

  const channels = product
    ? (
        await supabaseRead()
          .from("channels")
          .select("id, name, type, decoder, inbound_address, is_active, created_at")
          .eq("product_id", product.id)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Channels</h1>
        <p className="text-sm text-slate-500">
          Many front doors, one hallway. Adding a channel is a config action — pick a type, copy the
          artifact, start capturing.
        </p>
      </div>

      <AddChannelWizard />

      <SeedDemoButton />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Connected channels</h2>
        {channels.length === 0 ? (
          <p className="card p-6 text-sm text-slate-500">No channels yet.</p>
        ) : (
          <ul className="space-y-2">
            {channels.map((c) => (
              <li key={c.id} className="card flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.type} · {c.decoder}
                    {c.inbound_address ? ` · ${c.inbound_address}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                {c.type === "form" && (
                  <a
                    href={`/f/${c.id}`}
                    target="_blank"
                    className="text-sm text-pulse-600 hover:underline"
                  >
                    Open form ↗
                  </a>
                )}
                <span
                  className={`badge ${c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {c.is_active ? "active" : "inactive"}
                </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
