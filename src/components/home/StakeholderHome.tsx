import Link from "next/link";
import type { Product } from "@/lib/types";
import type { Session } from "@/lib/session";
import { ROLE_INFO } from "@/lib/roles";
import { getLeadershipSummary } from "@/lib/home-queries";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/ui";
import { getOverview } from "@/lib/overview-queries";
import { HomeHeader, Rhythm, Section, Empty, fmtDate } from "./parts";
import { Overview } from "./Overview";

/**
 * Leadership summary: "Are we listening, and what changed?" The same
 * Overview the PM sees, read-only, then what shipped and channel share.
 * It never shows teacher names, emails or words.
 */
export async function StakeholderHome({ product, staff }: { product: Product; staff: Session }) {
  const info = ROLE_INFO.stakeholder;
  const [s, overview] = await Promise.all([getLeadershipSummary(product.id), getOverview(product.id)]);
  const maxMonth = Math.max(1, ...s.months.map((m) => m.total));

  return (
    <div className="space-y-8">
      <HomeHeader info={info} name={staff.name || staff.email} product={product.name}>
        {s.lastReport && (
          <Link href="/reports" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-pulse-500">
            Latest {s.lastReport.kind} report ({fmtDate(s.lastReport.sent_at)}) →
          </Link>
        )}
      </HomeHeader>

      <Overview data={overview} canAct={false} />

      <Section title="What changed in the last 30 days" subtitle="Bugs fixed and ideas released">
        {s.shipped.length === 0 ? (
          <Empty>Nothing fixed or released in the last 30 days.</Empty>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {s.shipped.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  {t.category === "bug" ? "🐞 " : "💡 "}
                  {t.label}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {t.frequency} teachers · {fmtDate(t.fixed_at ?? t.released_at)}
                  <span className={`badge ${STATUS_STYLE[t.status as keyof typeof STATUS_STYLE]}`}>{STATUS_LABEL[t.status as keyof typeof STATUS_LABEL]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Moving to one channel" subtitle="The share of feedback arriving through Pulse's own form. The goal is for it to rise each month.">
        <div className="card p-5">
          <div className="flex h-28 items-end gap-3" role="img" aria-label="Feedback per month, with the share through the Pulse form">
            {s.months.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${Math.round((m.total / maxMonth) * 96)}px` }}>
                  <div className="bg-pulse-600" style={{ height: `${m.total ? (m.native / m.total) * 100 : 0}%` }} />
                  <div className="flex-1 bg-slate-200" />
                </div>
                <span className="text-xs text-slate-500">{m.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-pulse-600" /> Pulse form
            <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-slate-200" /> Other channels
            {s.oneChannel != null && ` · this month ${s.oneChannel}% through Pulse`}
          </p>
        </div>
      </Section>

      <p className="text-xs text-slate-400">This page shows themes and counts only. Teacher names, emails and words are never shown here.</p>

      <Rhythm info={info} />
    </div>
  );
}
