import Link from "next/link";
import type { Product } from "@/lib/types";
import type { Session } from "@/lib/session";
import { ROLE_INFO } from "@/lib/roles";
import { getEngineerBugs, isMine, type ReproSummary } from "@/lib/home-queries";
import { setThemeStatus, setThemeOwner } from "@/app/actions";
import { STATUS_LABEL, STATUS_STYLE, trend } from "@/lib/ui";
import { HomeHeader, Rhythm, Stat, Section, Empty, fmtDate } from "./parts";

/**
 * Engineer home: "What am I fixing, and how do I reproduce it?"
 * Owners are free text on each theme, matched to the signed-in name or email.
 * ?who= shows another engineer's list (handy for admins using View as).
 */
export async function EngineerHome({ product, staff, who }: { product: Product; staff: Session; who?: string }) {
  const info = ROLE_INFO.engineer;
  const bugs = await getEngineerBugs(product.id);
  const owners = Array.from(new Set(bugs.map((b) => b.theme.owner).filter(Boolean) as string[])).sort();

  const me = who ? { name: who, email: who } : { name: staff.name, email: staff.email };
  const mine = bugs.filter((b) => (who ? b.theme.owner === who : isMine(b.theme.owner, me)));
  const fixing = mine.filter((b) => b.theme.status === "being_fixed");
  const waiting = mine.filter((b) => b.theme.status === "open");
  const unassigned = bugs.filter((b) => !b.theme.owner).slice(0, 5);
  const myName = who ?? staff.name ?? staff.email;

  return (
    <div className="space-y-8">
      <HomeHeader info={info} name={staff.name || staff.email} product={product.name}>
        <form className="flex items-center gap-2 text-sm">
          <label htmlFor="who" className="text-slate-500">
            Showing bugs for
          </label>
          <select id="who" name="who" defaultValue={who ?? ""} className="rounded-lg border border-slate-300 bg-white px-2 py-1">
            <option value="">Me ({staff.name || staff.email})</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <button className="rounded-lg border border-slate-300 bg-white px-2 py-1 hover:border-pulse-500">Show</button>
        </form>
      </HomeHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Being fixed" value={fixing.length} note="Confirm on production when live" />
        <Stat label="Assigned, not started" value={waiting.length} tone={waiting.some((b) => b.theme.regressed) ? "bad" : undefined} note={waiting.some((b) => b.theme.regressed) ? "Includes a regression" : "Start with the top one"} />
        <Stat label="Open bugs with no owner" value={bugs.filter((b) => !b.theme.owner).length} note="Anyone can pick these up" />
      </div>

      <Section id="mine" title="Being fixed" subtitle="Press Confirm on production only once the fix is live. That emails every teacher who reported it.">
        {fixing.length === 0 ? <Empty>Nothing in progress.</Empty> : fixing.map((b) => <BugCard key={b.theme.id} b={b} />)}
      </Section>

      <Section title="Assigned to you, not started" subtitle="Most painful first">
        {waiting.length === 0 ? (
          <Empty>
            Nothing waiting.{" "}
            {mine.length === 0 && owners.length > 0 && "If your bugs are under a different name, pick it from “Showing bugs for” above."}
          </Empty>
        ) : (
          waiting.map((b) => <BugCard key={b.theme.id} b={b} />)
        )}
      </Section>

      <Section title="No owner yet" subtitle="The most painful open bugs nobody has picked up" action={<Link href="/backlog?kind=bug" className="text-sm text-pulse-600 hover:underline">All bugs →</Link>}>
        {unassigned.length === 0 ? (
          <Empty>Every open bug has an owner.</Empty>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {unassigned.map((b) => (
              <li key={b.theme.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <Link href={`/themes/${b.theme.id}`} className="font-medium hover:text-pulse-700">
                    {b.theme.label}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {b.reports} reports · severity {Number(b.theme.severity_score).toFixed(1)} · {trend(b.last7, b.prev7)}
                  </p>
                </div>
                <form action={setThemeOwner}>
                  <input type="hidden" name="id" value={b.theme.id} />
                  <input type="hidden" name="owner" value={myName} />
                  <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:border-pulse-500">Take it</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Rhythm info={info} />
    </div>
  );
}

function Mix({ label, rows, total }: { label: string; rows: [string, number][]; total: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">Not captured</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {rows.slice(0, 3).map(([k, n]) => (
            <li key={k} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0">{k}</span>
              <span className="h-1.5 flex-1 rounded-full bg-slate-100">
                <span className="block h-1.5 rounded-full bg-pulse-500" style={{ width: `${Math.round((n / Math.max(1, total)) * 100)}%` }} />
              </span>
              <span className="w-6 text-right text-slate-500">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One bug with its reproduction summary and the one next step. */
function BugCard({ b }: { b: ReproSummary }) {
  const captured = b.devices.reduce((n, [, c]) => n + c, 0);
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/themes/${b.theme.id}`} className="text-base font-semibold hover:text-pulse-700">
            {b.theme.label}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={`badge ${STATUS_STYLE[b.theme.status]}`}>{STATUS_LABEL[b.theme.status]}</span>
            {b.theme.regressed && <span className="badge bg-red-600 text-white">Regression</span>}
            <span>
              {b.reports} reports · severity {Number(b.theme.severity_score).toFixed(1)} · {trend(b.last7, b.prev7)} · first {fmtDate(b.firstAt)}, latest {fmtDate(b.lastAt)}
            </span>
          </p>
        </div>
        {b.theme.status === "open" ? (
          <form action={setThemeStatus}>
            <input type="hidden" name="id" value={b.theme.id} />
            <input type="hidden" name="status" value="being_fixed" />
            <button className="rounded-lg bg-pulse-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pulse-700">Start fix</button>
          </form>
        ) : (
          <form action={setThemeStatus}>
            <input type="hidden" name="id" value={b.theme.id} />
            <input type="hidden" name="status" value="fixed" />
            <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              Confirm on production → Fixed
            </button>
          </form>
        )}
      </div>

      <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-4">
        <Mix label="Device" rows={b.devices} total={captured} />
        <Mix label="Browser" rows={b.browsers} total={captured} />
        <div>
          <p className="text-xs font-medium text-slate-500">Where it happens</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {b.areas.slice(0, 2).map(([a]) => (
              <li key={a}>{a}</li>
            ))}
            {b.where.map((w) => (
              <li key={w} className="text-slate-600">
                &ldquo;{w}&rdquo;
              </li>
            ))}
            {b.areas.length === 0 && b.where.length === 0 && <li className="text-slate-400">Not captured</li>}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Evidence</p>
          <p className="mt-1 text-xs">
            {b.screenshots} screenshot{b.screenshots === 1 ? "" : "s"}
            <br />
            {b.last7} report{b.last7 === 1 ? "" : "s"} this week
          </p>
        </div>
      </div>

      {b.theme.suggestion && (
        <p className="text-sm text-slate-600">
          <span className="badge mr-1 bg-slate-100 text-slate-600">AI</span>
          {b.theme.suggestion}
        </p>
      )}

      {b.quotes.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">In teachers&apos; words</p>
          {b.quotes.map((q, i) => (
            <blockquote key={i} className="border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
              {q}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}
