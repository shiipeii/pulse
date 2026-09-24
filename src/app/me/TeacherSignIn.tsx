"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestTeacherLink, type AuthState } from "@/app/auth-actions";

export function TeacherSignIn() {
  const [state, action] = useFormState<AuthState, FormData>(requestTeacherLink, { ok: false });
  if (state.ok) return <p className="card p-4 text-sm text-emerald-700">{state.message}</p>;
  return (
    <form action={action} className="card space-y-3 p-5">
      <label className="block">
        <span className="text-sm font-medium">MOE email</span>
        <input name="email" type="email" required autoComplete="email" placeholder="you@moe.edu.sg" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
      </label>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Submit />
      <p className="text-xs text-slate-500">We&apos;ll email you a one-time sign-in link. No password needed.</p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="w-full rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50">
      {pending ? "Sending…" : "Email me a sign-in link"}
    </button>
  );
}
