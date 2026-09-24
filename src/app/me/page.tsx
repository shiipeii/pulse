import { getSession } from "@/lib/auth-server";
import { getMyFeedback, getTopSuggestions } from "@/lib/queries";
import { teacherSignOut } from "@/app/auth-actions";
import { TeacherSignIn } from "./TeacherSignIn";

export const dynamic = "force-dynamic";

type Step = "done" | "now" | "todo";

/**
 * Teacher portal (FR-50..53). Bugs show a 4-step status; suggestions show only
 * "Released" if they ship. Teachers see theme names and counts only.
 */
export default async function MyFeedback() {
  const s = await getSession();
  if (!s || !s.email.includes("@")) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Your feedback</h1>
        <p className="text-sm text-slate-600">
          Sign in with your MOE email to see the bugs you&apos;ve reported and the ideas you&apos;ve suggested.
        </p>
        <TeacherSignIn />
      </div>
    );
  }

  const [mine, top] = await Promise.all([getMyFeedback(s.email), getTopSuggestions(20)]);
  const bugs = mine.filter((m) => (m.category ?? m.user_category) === "bug");
  const myFeatures = mine.filter((m) => (m.category ?? m.user_category) === "feature");
  const mineByTheme = new Map<string, (typeof mine)[number]>();
  myFeatures.forEach((m) => m.theme_id && !mineByTheme.has(m.theme_id) && mineByTheme.set(m.theme_id, m));

  // One list: top ideas, plus every theme the teacher suggested, plus not-yet-grouped ones.
  const topIds = new Set(top.map((t) => t.id));
  const extraMine = myFeatures.filter((m) => m.theme_id && m.themes && !topIds.has(m.theme_id));
  const ungrouped = myFeatures.filter((m) => !m.theme_id);
  const seenExtra = new Set<string>();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your feedback</h1>
          <p className="text-sm text-slate-500">{s.email}</p>
        </div>
        <form action={teacherSignOut}>
          <button className="text-sm text-pulse-600 hover:underline">Sign out</button>
        </form>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Bugs you reported</h2>
          <p className="text-sm text-slate-500">We&apos;ll email you when each one is fixed.</p>
        </div>
        {bugs.length === 0 && <p className="card p-4 text-sm text-slate-500">No bug reports yet.</p>}
        {bugs.map((b) => {
          const st = b.themes?.status ?? "open";
          const fixed = st === "fixed";
          const fixing = st === "being_fixed" || fixed;
          const reviewed = b.review_status === "verified" || fixing || st === "not_now";
          const steps: [string, Step][] = [
            ["Received", "done"],
            ["Reviewed", reviewed ? "done" : "now"],
            ["Being fixed", fixed ? "done" : fixing ? "now" : "todo"],
            ["Fixed", fixed ? "done" : "todo"],
          ];
          return (
            <article key={b.id} className="card space-y-3 p-4">
              <div>
                <p className="font-medium">{b.themes?.label ?? b.summary ?? b.raw_text.slice(0, 80)}</p>
                <p className="text-xs text-slate-500">Reported {new Date(b.received_at).toLocaleDateString("en-SG")}</p>
              </div>
              <ol className="flex gap-1" aria-label="Status">
                {steps.map(([label, state]) => (
                  <li key={label} className="flex flex-1 flex-col items-center gap-1 text-center">
                    <span
                      className={`h-4 w-4 rounded-full ${
                        state === "done" ? "bg-emerald-600" : state === "now" ? "border-4 border-pulse-600 bg-white" : "border-2 border-slate-300"
                      }`}
                    />
                    <span className={`text-xs ${state === "now" ? "font-semibold text-pulse-700" : state === "done" ? "text-emerald-700" : "text-slate-500"}`}>
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
              {fixed && b.themes?.fixed_at && (
                <p className="text-sm text-emerald-700">Fixed on {new Date(b.themes.fixed_at).toLocaleDateString("en-SG")}. Thanks for reporting it.</p>
              )}
            </article>
          );
        })}
      </section>

      <section className="card overflow-hidden">
        <div className="p-4">
          <h2 className="text-lg font-semibold">Suggestions</h2>
          <p className="text-sm text-slate-500">
            Ideas teachers have suggested most. Yours are marked, so this is also your record of what you&apos;ve sent.
          </p>
        </div>
        <ul>
          {top.map((t) => (
            <SuggestionRow key={t.id} label={t.label} count={t.reporters} released={t.status === "released" ? t.released_at : null} mine={mineByTheme.get(t.id)} />
          ))}
          {extraMine.map((m) => {
            if (!m.theme_id || seenExtra.has(m.theme_id)) return null;
            seenExtra.add(m.theme_id);
            return (
              <SuggestionRow key={m.theme_id} label={m.themes!.label} count={null} released={m.themes!.status === "released" ? m.themes!.released_at : null} mine={m} />
            );
          })}
          {ungrouped.map((m) => (
            <SuggestionRow key={m.id} label={m.summary ?? m.raw_text.slice(0, 80)} count={null} released={null} mine={m} note="Being grouped with similar ideas" />
          ))}
          {top.length === 0 && myFeatures.length === 0 && <li className="border-t border-slate-100 p-4 text-sm text-slate-500">No suggestions yet.</li>}
        </ul>
      </section>

      <p className="text-center text-sm text-slate-500">Have something new? Use your team&apos;s feedback form.</p>
    </div>
  );
}

function SuggestionRow({
  label,
  count,
  released,
  mine,
  note,
}: {
  label: string;
  count: number | null;
  released: string | null;
  mine?: { received_at: string; raw_text: string };
  note?: string;
}) {
  return (
    <li className={`space-y-2 border-t border-slate-100 p-4 ${mine ? "bg-pulse-50/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium">{label}</span>
        {count !== null && (
          <span className="shrink-0 text-sm text-slate-500">
            {count} {count === 1 ? "teacher" : "teachers"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {released && <span className="badge bg-emerald-100 text-emerald-700">Released {new Date(released).toLocaleDateString("en-SG")}</span>}
        {mine && <span className="badge bg-indigo-50 text-indigo-700">You suggested this · {new Date(mine.received_at).toLocaleDateString("en-SG")}</span>}
        {note && <span className="badge bg-slate-100 text-slate-600">{note}</span>}
      </div>
      {mine && (
        <details className="text-sm text-slate-600">
          <summary className="cursor-pointer text-pulse-600">What you wrote</summary>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-2">{mine.raw_text}</p>
        </details>
      )}
    </li>
  );
}
