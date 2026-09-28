import Link from "next/link";
import type { RoleInfo } from "@/lib/roles";
import type { DecisionRate } from "@/lib/home-queries";

/** Page heading for a role home: who you are, and the one question this page answers. */
export function HomeHeader({ info, name, product, children }: { info: RoleInfo; name: string; product: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-pulse-600">
          {info.label} · {product}
        </p>
        <h1 className="text-2xl font-semibold">{info.homeTitle}</h1>
        <p className="text-sm text-slate-500">
          Hi {name.replace(/\s*\(.*\)\s*$/, "")}. {info.question}
        </p>
      </div>
      {children}
    </div>
  );
}

/** "When Pulse needs you": the role's rhythm, so people know what to do and when. */
export function Rhythm({ info }: { info: RoleInfo }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">When Pulse needs you</h2>
      <p className="text-xs text-slate-500">{info.uses}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {info.rhythm.map((r) => (
          <div key={r.when} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">{r.when}</p>
            <ul className="mt-1 space-y-1">
              {r.tasks.map((t) => (
                <li key={t.text} className="text-sm">
                  <Link href={t.href} className="text-slate-700 hover:text-pulse-700 hover:underline">
                    {t.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-ink";
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/** The north star with its 85% target and the "Not now" guard. */
export function DecisionRateCard({ rate }: { rate: DecisionRate }) {
  const pct = rate.rate ?? 0;
  const tone = rate.rate == null ? "text-slate-400" : pct >= 85 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-700";
  const bar = rate.rate == null ? "bg-slate-200" : pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">14-day decision rate</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{rate.rate == null ? "–" : `${pct}%`}</p>
      <div className="relative mt-2 h-2 rounded-full bg-slate-100" role="img" aria-label={`${pct}% against an 85% target`}>
        <div className={`h-2 rounded-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
        <div className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: "85%" }} title="Target 85%" />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {rate.total ? `${rate.decided} of ${rate.total} items decided within 14 days · target 85%` : "Not enough items yet · target 85%"}
      </p>
      {rate.notNowShare != null && rate.notNowShare >= 50 && (
        <p className="mt-1 text-xs text-red-700">Check: {rate.notNowShare}% of decisions are &ldquo;Not now&rdquo; (should stay under 50%).</p>
      )}
    </div>
  );
}

export function Section({ id, title, subtitle, action, children }: { id?: string; title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card p-5 text-sm text-slate-500">{children}</p>;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" }) : "–";

export function daysAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}
