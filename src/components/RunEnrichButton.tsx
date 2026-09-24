"use client";

import { useTransition } from "react";
import { triggerEnrich } from "@/app/actions";

/** Manually drain the enrich queue (also runnable via cron → /api/enrich). */
export function RunEnrichButton({ pending }: { pending: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => triggerEnrich())}
      disabled={isPending}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {isPending ? "Enriching…" : `Run enrich${pending ? ` (${pending} new)` : ""}`}
    </button>
  );
}
