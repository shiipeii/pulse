import { supabaseRead } from "@/lib/supabase";
import { signValue } from "@/lib/session";
import { unsubscribe } from "@/app/admin-actions";

export const dynamic = "force-dynamic";

/** FR-62: one-click unsubscribe from Pulse emails (signed link). */
export default async function UnsubscribePage({ searchParams }: { searchParams: { e?: string; s?: string } }) {
  const email = (searchParams.e ?? "").toLowerCase();
  const valid = Boolean(email) && searchParams.s === (await signValue(email));
  const { data } = valid ? await supabaseRead().from("email_optouts").select("email").eq("email", email).maybeSingle() : { data: null };
  return (
    <div className="mx-auto mt-12 max-w-sm card space-y-3 p-6 text-center">
      {!valid ? (
        <p className="text-sm text-slate-600">This unsubscribe link isn&apos;t valid.</p>
      ) : data ? (
        <p className="text-sm text-slate-600">{email} won&apos;t get any more emails from Pulse.</p>
      ) : (
        <form action={unsubscribe} className="space-y-3">
          <p className="text-sm text-slate-600">Stop emails about fixes and released features to {email}?</p>
          <input type="hidden" name="e" value={email} />
          <input type="hidden" name="s" value={searchParams.s} />
          <button className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700">Unsubscribe</button>
        </form>
      )}
    </div>
  );
}
