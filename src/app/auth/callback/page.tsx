"use client";

import { useEffect, useState } from "react";
import { completeSignIn } from "@/app/auth-actions";

/** Landing page for sign-in links: reads the token from the URL fragment, then signs in. */
export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const kind = query.get("k") ?? "teacher";
    const next = query.get("next") ?? (kind === "staff" ? "/" : "/me");
    const token = hash.get("access_token");
    if (!token) {
      setError(hash.get("error_description")?.replace(/\+/g, " ") ?? "This sign-in link is invalid or has expired.");
      return;
    }
    completeSignIn(token, kind, next).then((r) => {
      if (r.ok && r.to) window.location.replace(r.to);
      else setError(r.error ?? "Sign-in failed.");
    });
  }, []);

  return (
    <div className="mx-auto mt-16 max-w-sm card p-6 text-center">
      {error ? (
        <>
          <h1 className="text-lg font-semibold">Couldn&apos;t sign you in</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <a href="/me" className="mt-4 inline-block text-sm text-pulse-600 hover:underline">Request a new link</a>
        </>
      ) : (
        <p className="text-sm text-slate-600">Signing you in…</p>
      )}
    </div>
  );
}
