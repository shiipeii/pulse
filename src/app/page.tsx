import Link from "next/link";
import { getProduct } from "@/lib/product";
import {
  getThemes,
  groupThemes,
  getFeed,
  getStats,
  getFilterOptions,
  getReviewCounts,
  type FeedFilters,
} from "@/lib/queries";
import { FilterBar } from "@/components/FilterBar";
import { RunEnrichButton } from "@/components/RunEnrichButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SeverityBadge, SentimentBadge, Tag, ClassificationTrail } from "@/components/badges";
import type { Theme } from "@/lib/types";
import { getWeeklyActions } from "@/lib/insights";
import { getStaff } from "@/lib/auth-server";
import { canManage, STATUS_LABEL } from "@/lib/ui";
import { refreshWeeklyActions } from "@/app/automation-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const product = await getProduct(searchParams.product);
  if (!product) return <NoProduct />;

  const filters: FeedFilters = {
    featureArea: searchParams.featureArea,
    segment: searchParams.segment,
    channelId: searchParams.channelId,
    since: searchParams.since,
    category: searchParams.category,
  };

  const [themes, feed, stats, options, review, weekly, staff] = await Promise.all([
    getThemes(product.id),
    getFeed(product.id, filters),
    getStats(product.id),
    getFilterOptions(product.id),
    getReviewCounts(product.id),
    getWeeklyActions(product.id),
    getStaff(),
  ]);
  const themeLabel = new Map(themes.map((t) => [t.id, t.label]));

  const { bugs, fixedBugs, features, other } = groupThemes(themes);
  const waiting = (stats.new ?? 0) + (stats.processing ?? 0);

  return (
    <div className="space-y-8">
      <AutoRefresh active={(stats.processing ?? 0) > 0} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <p className="text-sm text-slate-500">
            {stats.total ?? 0} items · {bugs.length} open bug themes · {features.length} feature
            themes{waiting ? ` · ${waiting} being classified` : ""}
          </p>
        </div>
        <RunEnrichButton pending={stats.new ?? 0} />
      </div>

      {review.pending > 0 && (
        <Link
          href="/review"
          className="card flex items-center justify-between gap-3 border-amber-300 bg-amber-50 p-4 hover:border-amber-400"
        >
          <div>
            <p className="font-medium text-amber-900">
              {review.pending} item{review.pending === 1 ? "" : "s"} waiting for PM review
            </p>
            <p className="text-sm text-amber-800">
              {review.corrected > 0
                ? `${review.corrected} where the AI changed the submitter's label — check these first.`
                : "Confirm each item is truly a bug or a feature."}
            </p>
          </div>
          <span className="text-sm font-medium text-amber-900">Review →</span>
        </Link>
      )}

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Suggested actions this week</h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              Written by AI from this week&apos;s themes · check before acting
              {weekly ? ` · ${new Date(weekly.generatedAt).toLocaleDateString("en-SG")}` : ""}
            </span>
            {canManage(staff?.role) && (
              <form action={refreshWeeklyActions}>
                <button className="text-pulse-600 hover:underline">{weekly ? "Refresh" : "Generate"}</button>
              </form>
            )}
          </div>
        </div>
        {weekly && weekly.actions.length > 0 ? (
          <ol className="space-y-2">
            {weekly.actions.map((a, i) => (
              <li key={i} className="flex gap-3 border-t border-slate-100 pt-2 text-sm">
                <span className="font-semibold text-pulse-700">{i + 1}</span>
                <div className="flex-1">
                  <span className="font-medium">{a.title}</span>
                  <span className="ml-2 badge bg-slate-100 text-slate-600">{a.kind}</span>
                  <p className="text-slate-600">{a.detail}</p>
                </div>
                <Link href={`/themes/${a.theme_id}`} className="shrink-0 text-xs text-pulse-600 hover:underline">
                  {themeLabel.get(a.theme_id) ? "Open theme →" : ""}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">No suggestions yet. They refresh automatically each week.</p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ThemeColumn
          title="🐞 Bugs — what to fix"
          subtitle="Open bugs, ranked by frequency × severity"
          themes={bugs.slice(0, 8)}
          metric="bug"
          empty="No open bug themes."
          footer={
            fixedBugs.length > 0 ? `${fixedBugs.length} bug theme${fixedBugs.length === 1 ? "" : "s"} marked fixed` : undefined
          }
        />
        <ThemeColumn
          title="💡 Feature requests — what to build"
          subtitle="Ranked by demand (how many people asked)"
          themes={features.slice(0, 8)}
          metric="feature"
          empty="No feature themes yet."
        />
      </section>

      {other.length > 0 && (
        <section>
          <ThemeColumn
            title="Other feedback"
            subtitle="Praise, questions and general comments"
            themes={other.slice(0, 6)}
            metric="feature"
            empty=""
          />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Incoming feedback</h2>
          <FilterBar
            featureAreas={options.featureAreas}
            segments={options.segments}
            channels={options.channels}
          />
        </div>
        {feed.length === 0 ? (
          <p className="card p-6 text-sm text-slate-500">No feedback matches these filters yet.</p>
        ) : (
          <ul className="space-y-2">
            {feed.map((f) => (
              <li key={f.id} className="card p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <ClassificationTrail item={f} />
                  <SeverityBadge value={f.severity} />
                  <SentimentBadge value={f.sentiment} />
                  {f.feature_area && <Tag>{f.feature_area}</Tag>}
                  {f.segment && <Tag>{f.segment}</Tag>}
                  {(f.status === "new" || f.status === "processing") && <Tag>classifying…</Tag>}
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(f.received_at).toLocaleString("en-SG")}
                  </span>
                </div>
                <p className="text-sm text-ink">{f.summary ?? truncate(f.raw_text, 240)}</p>
                {f.author && <p className="mt-1 text-xs text-slate-400">— {f.author}</p>}
                {f.theme_id && (
                  <Link
                    href={`/themes/${f.theme_id}`}
                    className="mt-1 inline-block text-xs text-pulse-600 hover:underline"
                  >
                    View theme →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ThemeColumn({
  title,
  subtitle,
  themes,
  metric,
  empty,
  footer,
}: {
  title: string;
  subtitle: string;
  themes: Theme[];
  metric: "bug" | "feature";
  empty: string;
  footer?: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {themes.length === 0 ? (
        <p className="card p-6 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {themes.map((t) => (
            <li key={t.id}>
              <Link
                href={`/themes/${t.id}`}
                className="card flex items-center justify-between gap-3 p-4 hover:border-pulse-500"
              >
                <div>
                  <p className="font-medium text-ink">
                    {t.label}
                    {t.regressed && (
                      <span className="badge ml-2 bg-red-100 text-red-700">regression</span>
                    )}
                    {(t.status === "being_fixed" || t.status === "planned") && (
                      <span className="badge ml-2 bg-amber-100 text-amber-800">{STATUS_LABEL[t.status]}</span>
                    )}
                  </p>
                  {t.summary && <p className="text-xs text-slate-500">{t.summary}</p>}
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500">
                  <div className="text-lg font-semibold text-ink">{t.frequency}</div>
                  <div>
                    {metric === "bug"
                      ? `sev ${Number(t.severity_score).toFixed(1)}${t.severity_score >= 3 ? " ⚠" : ""}`
                      : t.frequency === 1
                        ? "request"
                        : "requests"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {footer && <p className="text-xs text-slate-400">{footer}</p>}
    </div>
  );
}

function NoProduct() {
  return (
    <div className="card p-8 text-center">
      <h1 className="text-xl font-semibold">No tenant found</h1>
      <p className="mt-2 text-sm text-slate-500">
        Run the migrations and <code>supabase/seed.sql</code> to create tenant zero
        (Teacher&apos;s Workspace), then add a channel.
      </p>
      <Link
        href="/channels"
        className="mt-4 inline-block rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white"
      >
        Add a channel
      </Link>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
