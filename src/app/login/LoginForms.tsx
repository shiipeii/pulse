"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestStaffLink, passwordLogin, type AuthState } from "@/app/auth-actions";

const input = "w-full rounded-lg border border-slate-300 p-2 text-sm";

export function LoginForms({ next, passwordEnabled }: { next: string; passwordEnabled: boolean }) {
  const [linkState, linkAction] = useFormState<AuthState, FormData>(requestStaffLink, { ok: false });
  const [pwState, pwAction] = useFormState<AuthState, FormData>(passwordLogin, { ok: false });

  return (
    <>
      <form action={linkAction} className="card space-y-3 p-5">
        <p className="text-sm font-medium">Email me a sign-in link</p>
        <input type="hidden" name="next" value={next} />
        <input name="email" type="email" required placeholder="you@moe.gov.sg" className={input} />
        {linkState.message && <p className="text-sm text-emerald-700">{linkState.message}</p>}
        {linkState.error && <p className="text-sm text-rose-600">{linkState.error}</p>}
        <Submit label="Send link" />
      </form>

      {passwordEnabled && (
        <form action={pwAction} className="card space-y-3 p-5">
          <p className="text-sm font-medium">Or use the team password</p>
          <input type="hidden" name="next" value={next} />
          <input name="password" type="password" required placeholder="Password" className={input} />
          {pwState.error && <p className="text-sm text-rose-600">{pwState.error}</p>}
          <Submit label="Sign in" secondary />
        </form>
      )}
    </>
  );
}

function Submit({ label, secondary }: { label: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={`w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
        secondary ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-pulse-600 text-white hover:bg-pulse-700"
      }`}
    >
      {pending ? "Working…" : label}
    </button>
  );
}
