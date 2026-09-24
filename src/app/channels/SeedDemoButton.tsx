"use client";

import { useTransition } from "react";
import { seedDemo } from "@/app/actions";

/** One-click sample data so a fresh deployment demos well. */
export function SeedDemoButton() {
  const [pending, start] = useTransition();
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-medium">Demo data</p>
        <p className="text-sm text-slate-500">
          Adds ~26 realistic teacher comments (bugs, feature requests, a few mislabelled) and
          starts classifying them. Safe to click twice — nothing is duplicated.
        </p>
      </div>
      <button
        onClick={() => start(() => seedDemo())}
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Loading… (up to a minute)" : "Load demo data"}
      </button>
    </div>
  );
}
