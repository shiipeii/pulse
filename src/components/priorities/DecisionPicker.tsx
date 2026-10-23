"use client";

import { useRef } from "react";
import { setDecision } from "@/app/priority-actions";

const OPTIONS: [string, string][] = [
  ["", "Decide…"],
  ["now", "Now"],
  ["next", "Next"],
  ["later", "Later"],
  ["not_now", "Not now"],
];

/** One-click decision: picking an option saves it straight away. */
export function DecisionPicker({ id, value, label }: { id: string; value: string | null; label: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setDecision}>
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`decision-${id}`}>
        Decision for {label}
      </label>
      <select
        id={`decision-${id}`}
        name="decision"
        defaultValue={value ?? ""}
        onChange={() => form.current?.requestSubmit()}
        className={`h-9 rounded-lg border px-2 text-sm ${
          value ? "border-slate-300 bg-white text-ink" : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
      >
        {OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </form>
  );
}
