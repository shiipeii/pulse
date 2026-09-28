import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/product";
import { getThemeWithItems, getThemeEvidence, getAttachmentsFor } from "@/lib/queries";
import { supabaseRead } from "@/lib/supabase";
import { getStaff } from "@/lib/auth-server";
import { canSeeNames } from "@/lib/roles";
import { signedViewUrls } from "@/lib/storage";
import { SeverityBadge, SentimentBadge, Tag, CategoryBadge, ClassificationTrail } from "@/components/badges";
import { setThemeStatus, setThemeOwner, moveItem, splitItem, mergeTheme } from "@/app/actions";
import { suggestForTheme, draftTicketNow } from "@/app/automation-actions";
import { TicketPanel } from "@/components/TicketPanel";
import { STATUS_LABEL, STATUS_STYLE, canEdit, canManage, trend } from "@/lib/ui";
import type { ThemeStats, ThemeStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NEXT_STEPS: Record<string, { status: ThemeStatus; label: string; primary?: boolean }[]> = {
  bug: [
    { status: "being_fixed", label: "Start fixing" },
    { status: "fixed", label: "✓ Confirm on production → Fixed", primary: true },
    { status: "not_now", label: "Not now" },
    { status: "open", label: "Reopen" },
  ],
  feature: [
    { status: "planned", label: "Plan it (internal)" },
    { status: "released", label: "✓ Mark released", primary: true },
    { status: "not_now", label: "Not now" },
    { status: "open", label: "Reopen" },
  ],
  other: [
    { status: "not_now", label: "Close (not now)" },
    { status: "open", label: "Reopen" },
  ],
};

export default async function ThemePage({
  params,
  searchParams,
}: {
  params: { themeId: string };
  searchParams: Record<string, string | undefined>;
}) {
  const product = await getProduct(searchParams.product);
  if (!product) notFound();

  const result = await getThemeWithItems(product.id, params.themeId);
  if (!result) notFound();
  const { theme, items } = result;
  const staff = await getStaff();
  const edit = canEdit(staff?.role);
  const manage = canManage(staff?.role);
  // Stakeholders see summaries only: no teacher words, names or screenshots.
  const names = canSeeNames(staff?.role);

  const db = supabaseRead();
  const [evidence, { data: stats }, { data: ticket }, { data: siblings }, { data: notes }, att] = await Promise.all([
    getThemeEvidence(theme.id),
    db.from("theme_stats").select("*").eq("theme_id", theme.id).maybeSingle(),
    db.from("tickets").select("*").eq("theme_id", theme.id).maybeSingle(),
    db.from("themes").select("id, label").eq("product_id", product.id).eq("category", theme.category).neq("id", theme.id).gt("frequency", 0).order("label"),
    db.from("notifications").select("status").eq("theme_id", theme.id),
    getAttachmentsFor(items.map((i) => i.id)),
  ]);
  const s = stats as ThemeStats | null;
  const urls = await signedViewUrls(Array.from(att.values()).flat()).catch(() => ({}) as Record<string, string>);
  const notified = (notes ?? []).filter((n) => n.status === "sent").length;
  const pendingNotify = (notes ?? []).filter((n) => n.status === "skipped_no_provider").length;
  const maxWeek = Math.max(1, ...evidence.weeks.map((w) => w.count));

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-pulse-600 hover:underline">
        ← Back to home
      </Link>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge value={theme.category} />
          <span className={`badge ${STATUS_STYLE[theme.status]}`}>{STATUS_LABEL[theme.status]}</span>
          {theme.regressed && <span className="badge bg-red-100 text-red-700">regression — reported again after fix</span>}
          <SentimentBadge value={theme.sentiment} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{theme.label}</h1>
          {theme.summary && <p className="mt-1 text-slate-600">{theme.summary}</p>}
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <Stat label="Reports" value={String(s?.items ?? theme.frequency)} note={trend(s?.last7, s?.prev7)} />
          <Stat label="People" value={String(s?.reporters ?? "–")} note={`across ${s?.channels ?? 1} channel(s)`} />
          <Stat label="Severity" value={Number(theme.severity_score).toFixed(1)} note="of 4" />
          <Stat
            label={theme.category === "feature" ? "Released" : "Fixed"}
            value={theme.fixed_at ? new Date(theme.fixed_at).toLocaleDateString("en-SG") : theme.released_at ? new Date(theme.released_at).toLocaleDateString("en-SG") : "–"}
            note={notified || pendingNotify ? `${notified} emailed${pendingNotify ? `, ${pendingNotify} waiting for email setup` : ""}` : ""}
          />
        </div>

        {edit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            {(NEXT_STEPS[theme.category] ?? NEXT_STEPS.other)
              .filter((a) => a.status !== theme.status)
              .map((a) => (
                <form key={a.status} action={setThemeStatus}>
                  <input type="hidden" name="id" value={theme.id} />
                  <input type="hidden" name="status" value={a.status} />
                  <button
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      a.primary ? "bg-pulse-600 text-white hover:bg-pulse-700" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {a.label}
                  </button>
                </form>
              ))}
            <form action={setThemeOwner} className="ml-auto flex items-center gap-2 text-sm">
              <input type="hidden" name="id" value={theme.id} />
              <label className="text-slate-500" htmlFor="owner">Owner</label>
              <input id="owner" name="owner" defaultValue={theme.owner ?? ""} placeholder="Name" className="w-32 rounded-lg border border-slate-300 px-2 py-1" />
              <button className="rounded-lg border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50">Save</button>
            </form>
          </div>
        )}
        {theme.category === "feature" && (
          <p className="text-xs text-slate-500">Teachers only ever see &quot;Released&quot;. Planned and Not now stay internal.</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Suggested improvement</h2>
              {edit && (
                <form action={suggestForTheme}>
                  <input type="hidden" name="id" value={theme.id} />
                  <button className="text-sm text-pulse-600 hover:underline">{theme.suggestion ? "Regenerate" : "Suggest with AI"}</button>
                </form>
              )}
            </div>
            {theme.suggestion ? (
              <>
                <p className="text-sm leading-6">{theme.suggestion}</p>
                <p className="text-xs text-slate-500">AI-written from {s?.items ?? theme.frequency} reports. Check before acting.</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">No suggestion yet.</p>
            )}
          </section>

          <TicketPanel themeId={theme.id} ticket={ticket} canAct={manage} draftAction={draftTicketNow} />

          <section>
            <h2 className="mb-3 text-lg font-semibold">What people said ({items.length})</h2>
            <ul className="space-y-2">
              {items.map((f) => (
                <li key={f.id} className="card p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <ClassificationTrail item={f} />
                    <SeverityBadge value={f.severity} />
                    <SentimentBadge value={f.sentiment} />
                    {f.feature_area && <Tag>{f.feature_area}</Tag>}
                    {f.segment && <Tag>{f.segment}</Tag>}
                    <span className="ml-auto text-xs text-slate-400">{new Date(f.received_at).toLocaleString("en-SG")}</span>
                  </div>
                  {f.summary && <p className="text-sm font-medium text-ink">{f.summary}</p>}
                  {names && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{f.raw_text}</p>}
                  {names && f.author && <p className="mt-1 text-xs text-slate-400">— {f.author}</p>}
                  {names && (att.get(f.id) ?? []).length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {(att.get(f.id) ?? []).map((p) =>
                        urls[p] ? (
                          <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={urls[p]} alt="Screenshot attached to this report" className="h-16 w-24 rounded border border-slate-200 object-cover" />
                          </a>
                        ) : null,
                      )}
                    </div>
                  )}
                  {manage && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs">
                      {(siblings ?? []).length > 0 && (
                        <form action={moveItem} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={f.id} />
                          <select name="target" className="rounded border border-slate-300 px-1 py-0.5" defaultValue="">
                            <option value="" disabled>Move to theme…</option>
                            {(siblings ?? []).map((t) => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                          </select>
                          <button className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-50">Move</button>
                        </form>
                      )}
                      {items.length > 1 && (
                        <form action={splitItem}>
                          <input type="hidden" name="id" value={f.id} />
                          <button className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-50">Split into new theme</button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">Reports per week</h2>
            <div className="flex h-28 items-end gap-1" role="img" aria-label="Reports per week for the last 8 weeks">
              {evidence.weeks.map((w) => (
                <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-pulse-500" style={{ height: `${(w.count / maxWeek) * 88}px` }} title={`${w.count} reports`} />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>{evidence.weeks[0]?.label}</span>
              <span>this week</span>
            </div>
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">Where it came from</h2>
            {evidence.channels.map(([name, n]) => (
              <div key={name} className="space-y-1 text-sm">
                <div className="flex justify-between"><span>{name}</span><span>{n}</span></div>
                <div className="h-2 rounded bg-slate-100">
                  <div className="h-2 rounded bg-pulse-600" style={{ width: `${(n / Math.max(1, evidence.total)) * 100}%` }} />
                </div>
              </div>
            ))}
          </section>

          {manage && (siblings ?? []).length > 0 && (
            <section className="card space-y-2 p-5">
              <h2 className="font-semibold">Merge this theme</h2>
              <p className="text-xs text-slate-500">Moves every report here into another {theme.category} theme.</p>
              <form action={mergeTheme} className="space-y-2">
                <input type="hidden" name="id" value={theme.id} />
                <select name="target" className="w-full rounded-lg border border-slate-300 p-1.5 text-sm" defaultValue="">
                  <option value="" disabled>Choose a theme…</option>
                  {(siblings ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <button className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Merge</button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-ink">{value}</div>
      {note && <div className="text-xs text-slate-500">{note}</div>}
    </div>
  );
}
