import Link from "next/link";
import { getProduct } from "@/lib/product";
import { supabaseRead } from "@/lib/supabase";
import { getStaff } from "@/lib/auth-server";
import { jiraConfigured } from "@/lib/jira";
import { canManage } from "@/lib/ui";
import { TicketPanel } from "@/components/TicketPanel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** FR-93: drafted tickets waiting for one-click filing, and what's been filed. */
export default async function TicketsPage() {
  const product = await getProduct();
  if (!product) return <p className="card p-6 text-sm">No product found.</p>;
  const staff = await getStaff();
  const { data } = await supabaseRead()
    .from("tickets")
    .select("*, themes(id, label, category)")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });
  const drafts = (data ?? []).filter((t) => t.status === "draft");
  const filed = (data ?? []).filter((t) => t.status === "filed");
  const threshold = process.env.TICKET_THRESHOLD ?? "5";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-slate-500">
          Pulse drafts a ticket when a verified theme reaches {threshold} reports, or any critical bug. You file it in one click.
          {!jiraConfigured() && " Jira isn't connected yet, so copy the text or paste the key after filing by hand."}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Drafts waiting ({drafts.length})</h2>
        {drafts.length === 0 && <p className="card p-4 text-sm text-slate-500">No drafts right now.</p>}
        {drafts.map((t) => (
          <div key={t.id} className="space-y-1">
            <Link href={`/themes/${t.theme_id}`} className="text-sm text-pulse-600 hover:underline">{t.themes?.label} →</Link>
            <TicketPanel themeId={t.theme_id} ticket={t} canAct={canManage(staff?.role)} />
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Filed ({filed.length})</h2>
        <ul className="card divide-y divide-slate-100">
          {filed.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="font-medium text-pulse-600 hover:underline">{t.jira_key}</a> : <span className="font-medium">{t.jira_key}</span>}
              <span>{t.title}</span>
              <Link href={`/themes/${t.theme_id}`} className="ml-auto text-xs text-slate-500 hover:underline">{t.themes?.label}</Link>
            </li>
          ))}
          {filed.length === 0 && <li className="p-3 text-sm text-slate-500">Nothing filed yet.</li>}
        </ul>
      </section>
    </div>
  );
}
