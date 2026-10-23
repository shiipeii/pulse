import Link from "next/link";
import type { Product } from "@/lib/types";
import type { Session } from "@/lib/session";
import { ROLE_INFO } from "@/lib/roles";
import { getReviewCounts } from "@/lib/queries";
import { getOverview } from "@/lib/overview-queries";
import { getWeeklyActions } from "@/lib/insights";
import { supabaseRead } from "@/lib/supabase";
import { getSourceHealth, getStaleThemes, getTicketDraftCount } from "@/lib/home-queries";
import { HomeHeader, Rhythm, Section, Empty, daysAgo } from "./parts";
import { Overview } from "./Overview";

/**
 * PM home: "What needs my decision today?" The Overview first (act now,
 * quick wins, most frequent, product areas), then everything waiting on the
 * PM, suggested actions and source health.
 */
export async function PmHome({ product, staff }: { product: Product; staff: Session }) {
  const info = ROLE_INFO.pm;
  const [overview, review, drafts, stale, weekly, sources, reportDrafts] = await Promise.all([
    getOverview(product.id),
    getReviewCounts(product.id),
    getTicketDraftCount(product.id),
    getStaleThemes(product.id),
    getWeeklyActions(product.id),
    getSourceHealth(product.id),
    supabaseRead().from("reports").select("id, kind, period_start").eq("product_id", product.id).eq("status", "draft").order("period_start", { ascending: false }),
  ]);
  const todo = [
    review.pending > 0 && {
      href: "/review",
      title: `${review.pending} item${review.pending === 1 ? "" : "s"} to verify`,
      note: review.corrected ? `${review.corrected} where the AI changed the teacher's label. Check these first.` : "Confirm each is a bug, a feature or other.",
    },
    drafts > 0 && { href: "/tickets", title: `${drafts} ticket draft${drafts === 1 ? "" : "s"} ready`, note: "File to Jira in one click, or dismiss." },
    (reportDrafts.data ?? []).length > 0 && {
      href: "/reports",
      title: `${(reportDrafts.data ?? []).length} report${(reportDrafts.data ?? []).length === 1 ? "" : "s"} ready to send`,
      note: "Weekly digest or monthly readout, drafted by Pulse.",
    },
    stale.length > 0 && { href: "#stale", title: `${stale.length} theme${stale.length === 1 ? "" : "s"} with no decision for 14+ days`, note: "These pull the decision rate down." },
  ].filter(Boolean) as { href: string; title: string; note: string }[];

  return (
    <div className="space-y-8">
      <HomeHeader info={info} name={staff.name || staff.email} product={product.name}>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-pulse-500">
          Full dashboard →
        </Link>
      </HomeHeader>

      <Overview data={overview} canAct />

      <Section title="Waiting on you" subtitle="Everything that needs your click, most urgent first">
        {todo.length === 0 ? (
          <Empty>You&apos;re all caught up.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {todo.map((t) => (
              <li key={t.title}>
                <Link href={t.href} className="card flex h-full items-center justify-between gap-3 p-4 hover:border-pulse-500">
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-sm text-slate-500">{t.note}</p>
                  </div>
                  <span className="text-pulse-600">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {stale.length > 0 && (
        <Section id="stale" title="Waiting 14+ days for a decision" subtitle="Pick one: file a ticket, start a fix, plan it, or mark it Not now">
          <ul className="card divide-y divide-slate-100">
            {stale.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <Link href={`/themes/${t.id}`} className="font-medium hover:text-pulse-700">
                  <span className="mr-2">{t.category === "bug" ? "🐞" : "💡"}</span>
                  {t.label}
                </Link>
                <span className="shrink-0 text-xs text-slate-500">
                  {t.frequency} reports · open {t.days} days
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Suggested actions this week" subtitle="Written by AI. Check before acting.">
        {weekly && weekly.actions.length > 0 ? (
          <ol className="card divide-y divide-slate-100">
            {weekly.actions.slice(0, 3).map((a, i) => (
              <li key={i} className="p-3 text-sm">
                <Link href={`/themes/${a.theme_id}`} className="font-medium hover:text-pulse-700">
                  {i + 1}. {a.title}
                </Link>
                <p className="text-slate-600">{a.detail}</p>
              </li>
            ))}
          </ol>
        ) : (
          <Empty>No suggestions yet. They refresh every Monday once the AI key is added.</Empty>
        )}
      </Section>

      <Section id="sources" title="Is feedback still flowing in?" subtitle="A connected source with nothing new for 14 days is marked quiet" action={<Link href="/sources" className="text-sm text-pulse-600 hover:underline">All sources →</Link>}>
        {sources.rows.length === 0 ? (
          <Empty>
            No sources listed yet. <Link href="/sources" className="text-pulse-600 hover:underline">Add your shared mailbox and FormSG forms</Link>.
          </Empty>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {sources.rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  <span className="font-medium">{s.name}</span>
                  {s.owner && <span className="text-slate-500"> · {s.owner}</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {s.state !== "not_connected" && <>Last item {daysAgo(s.lastAt)}</>}
                  <span
                    className={`badge ${s.state === "flowing" ? "bg-emerald-100 text-emerald-700" : s.state === "quiet" ? "bg-amber-100 text-amber-800" : "bg-red-50 text-red-700"}`}
                  >
                    {s.state === "flowing" ? "Flowing" : s.state === "quiet" ? "Quiet" : "Not connected"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Rhythm info={info} />
    </div>
  );
}
