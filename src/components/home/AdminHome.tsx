import Link from "next/link";
import type { Product, StaffRole } from "@/lib/types";
import type { Session } from "@/lib/session";
import { ROLE_INFO, PREVIEWABLE } from "@/lib/roles";
import { STAGES, NOT_YET, WHO_LABEL, NEEDS_LABEL, setupStatus, type Who } from "@/lib/feature-map";
import { getStats, getReviewCounts, getThemes, groupThemes } from "@/lib/queries";
import { getDecisionRate, getSourceHealth } from "@/lib/home-queries";
import { allowedTeacherDomains } from "@/lib/auth-server";
import { supabaseRead } from "@/lib/supabase";
import { startViewAs } from "@/app/view-as-actions";
import { HomeHeader, Rhythm, Stat, DecisionRateCard, Section } from "./parts";

const WHO_STYLE: Record<Who, string> = {
  admin: "bg-slate-800 text-white",
  pm: "bg-pulse-50 text-pulse-700",
  engineer: "bg-amber-50 text-amber-800",
  stakeholder: "bg-sky-50 text-sky-700",
  teacher: "bg-emerald-50 text-emerald-700",
  system: "bg-slate-100 text-slate-600",
};

/**
 * Admin master view: every feature on one page, laid out along the journey
 * a piece of feedback takes, plus "View as" for each role and a setup check.
 */
export async function AdminHome({ product, staff }: { product: Product; staff: Session }) {
  const info = ROLE_INFO.admin;
  const setup = setupStatus();
  const [stats, review, themes, rate, sources, staffCount] = await Promise.all([
    getStats(product.id),
    getReviewCounts(product.id),
    getThemes(product.id),
    getDecisionRate(product.id),
    getSourceHealth(product.id),
    supabaseRead().from("staff").select("role"),
  ]);
  const { bugs, features } = groupThemes(themes);
  const roleCount = new Map<string, number>();
  (staffCount.data ?? []).forEach((r) => roleCount.set(r.role, (roleCount.get(r.role) ?? 0) + 1));

  const checks: { label: string; ok: boolean; fix: string }[] = [
    { label: "Database connected", ok: true, fix: "" },
    { label: "Anthropic key (AI labels, category check, suggestions)", ok: setup.ai, fix: "Add ANTHROPIC_API_KEY in Vercel. Until then, new feedback waits as “classifying…”." },
    { label: "OpenAI key (themes and search)", ok: setup.embeddings, fix: "Add OPENAI_API_KEY in Vercel. Until then, search is empty and new items aren't grouped." },
    { label: "Email to teachers (Resend)", ok: setup.email, fix: "Add RESEND_API_KEY and EMAIL_FROM. Until then, Pulse records who would have been emailed." },
    { label: "Jira", ok: setup.jira, fix: "Optional. Ticket drafts still work, and you can copy them into Jira by hand." },
    { label: "Shared feedback mailbox (Outlook)", ok: setup.mailbox, fix: "Needs IT to grant access to one mailbox (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET)." },
    { label: "Email forwarding address (Cloudflare)", ok: setup.inbound_email, fix: "Optional. Set INBOUND_EMAIL_DOMAIN once Cloudflare Email Routing is set up." },
    { label: `Teacher sign-in domains: ${allowedTeacherDomains().join(", ")}`, ok: true, fix: "" },
    {
      label: `Staff accounts: ${(staffCount.data ?? []).length} (${Array.from(roleCount.entries()).map(([r, n]) => `${n} ${r}`).join(", ") || "none"})`,
      ok: (staffCount.data ?? []).length > 0,
      fix: "Add named accounts on the Staff page so people stop sharing the password.",
    },
  ];
  const featureCount = STAGES.reduce((n, s) => n + s.features.length, 0);
  const ready = STAGES.reduce((n, s) => n + s.features.filter((f) => !f.needs || setup[f.needs]).length, 0);

  return (
    <div className="space-y-10">
      <HomeHeader info={info} name={staff.name || staff.email} product={product.name}>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-pulse-500">
          Full dashboard →
        </Link>
      </HomeHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Feedback items" value={stats.total ?? 0} note={(stats.new ?? 0) + (stats.processing ?? 0) ? `${(stats.new ?? 0) + (stats.processing ?? 0)} waiting for AI` : "All classified"} />
        <Stat label="Waiting for PM review" value={review.pending} />
        <Stat label="Open themes" value={bugs.length + features.length} note={`${bugs.length} bugs · ${features.length} features`} />
        <DecisionRateCard rate={rate} />
        <Stat label="Features ready" value={`${ready} of ${featureCount}`} note="The rest need a key or approval" tone={ready === featureCount ? "good" : "warn"} />
      </div>

      <Section title="See Pulse as each role" subtitle="Each role lands on its own home after signing in. Use View as to see exactly what they see and can do.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PREVIEWABLE.map((r: StaffRole) => {
            const ri = ROLE_INFO[r];
            return (
              <div key={r} className="card flex flex-col p-4">
                <span className={`badge self-start ${WHO_STYLE[r]}`}>{ri.label}</span>
                <p className="mt-2 font-medium">{ri.homeTitle}</p>
                <p className="text-sm text-slate-600">{ri.job}</p>
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">Asks:</span> &ldquo;{ri.question}&rdquo;
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">Uses Pulse:</span> {ri.uses}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">Menu:</span> {ri.nav.map((n) => n.label).join(" · ")}
                </p>
                <form action={startViewAs} className="mt-auto pt-3">
                  <input type="hidden" name="role" value={r} />
                  <button className="w-full rounded-lg bg-pulse-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pulse-700">View as {ri.label}</button>
                </form>
              </div>
            );
          })}
          <div className="card flex flex-col p-4">
            <span className={`badge self-start ${WHO_STYLE.teacher}`}>Teacher</span>
            <p className="mt-2 font-medium">Form and Your feedback</p>
            <p className="text-sm text-slate-600">Reports a bug or suggests an idea, then hears back when it&apos;s fixed or released.</p>
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Asks:</span> &ldquo;Did anyone read what I sent?&rdquo;
            </p>
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Uses Pulse:</span> Rarely, when something goes wrong or they have an idea
            </p>
            <div className="mt-auto flex gap-2 pt-3">
              <Link href="/channels" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm hover:border-pulse-500">
                Form links
              </Link>
              <Link href="/me" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm hover:border-pulse-500">
                /me
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <Section title="The whole flow, and every feature in it" subtitle="The journey one piece of feedback takes, from a teacher's report to a fix they hear about">
        <ol className="flex flex-wrap items-stretch gap-2">
          {STAGES.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <a href={`#${s.id}`} className="card flex items-center gap-2 px-3 py-2 text-sm hover:border-pulse-500">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-pulse-600 text-xs font-bold text-white">{s.step}</span>
                <span className="font-medium">{s.title}</span>
              </a>
              {i < STAGES.length - 1 && <span className="text-slate-400">→</span>}
            </li>
          ))}
        </ol>

        <div className="space-y-6">
          {STAGES.map((s) => (
            <div key={s.id} id={s.id} className="card scroll-mt-6 overflow-hidden">
              <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-pulse-600 text-xs font-bold text-white">{s.step}</span>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-slate-500">{s.goal}</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {s.features.map((f) => {
                  const ok = !f.needs || setup[f.needs];
                  return (
                    <li key={f.name} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[1.3fr_2fr_1fr_auto] md:items-center">
                      <div>
                        <p className="font-medium">{f.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {f.who.map((w) => (
                            <span key={w} className={`badge ${WHO_STYLE[w]}`}>
                              {WHO_LABEL[w]}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-slate-600">{f.what}</p>
                      <p className="text-xs text-slate-500">{f.when}</p>
                      <div className="flex items-center gap-2 md:justify-end">
                        <span className={`badge whitespace-nowrap ${ok ? "bg-emerald-100 text-emerald-700" : f.needs === "approval" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>
                          {ok ? "Ready" : NEEDS_LABEL[f.needs!]}
                        </span>
                        {f.href && ok && (
                          <Link href={f.href} className="whitespace-nowrap text-xs text-pulse-600 hover:underline">
                            Open →
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="setup" title="Setup check" subtitle="What's connected, and what each missing piece switches off">
          <ul className="card divide-y divide-slate-100">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-3 p-3 text-sm">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${c.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                  {c.ok ? "✓" : "!"}
                </span>
                <div>
                  <p className="font-medium">{c.label}</p>
                  {!c.ok && <p className="text-xs text-slate-500">{c.fix}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="space-y-8">
          <Section title="Feedback sources" subtitle={`${sources.coverage}% of listed sources connected or imported`} action={<Link href="/sources" className="text-sm text-pulse-600 hover:underline">Manage →</Link>}>
            <ul className="card divide-y divide-slate-100">
              {sources.rows.length === 0 && <li className="p-3 text-sm text-slate-500">None listed yet.</li>}
              {sources.rows.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between p-3 text-sm">
                  <span>{r.name}</span>
                  <span className={`badge ${r.state === "flowing" ? "bg-emerald-100 text-emerald-700" : r.state === "quiet" ? "bg-amber-100 text-amber-800" : "bg-red-50 text-red-700"}`}>
                    {r.state === "flowing" ? "Flowing" : r.state === "quiet" ? "Quiet" : "Not connected"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Not built yet" subtitle="Designed or waiting for approval">
            <ul className="card divide-y divide-slate-100">
              {NOT_YET.map((n) => (
                <li key={n.name} className="p-3 text-sm">
                  <p className="font-medium text-slate-500">{n.name}</p>
                  <p className="text-xs text-slate-400">{n.why}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Rhythm info={info} />
    </div>
  );
}
