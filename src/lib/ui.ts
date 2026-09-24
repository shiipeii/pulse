import type { ThemeStatus } from "./types";

/** Staff-facing status labels. */
export const STATUS_LABEL: Record<ThemeStatus, string> = {
  open: "Open",
  being_fixed: "Being fixed",
  fixed: "Fixed",
  planned: "Planned (internal)",
  not_now: "Not now (internal)",
  released: "Released",
};

export const STATUS_STYLE: Record<ThemeStatus, string> = {
  open: "bg-red-50 text-red-700",
  being_fixed: "bg-amber-100 text-amber-800",
  fixed: "bg-emerald-100 text-emerald-700",
  planned: "bg-indigo-50 text-indigo-700",
  not_now: "bg-slate-100 text-slate-600",
  released: "bg-emerald-100 text-emerald-700",
};

export const canEdit = (role?: string) => role === "admin" || role === "pm" || role === "engineer";
export const canManage = (role?: string) => role === "admin" || role === "pm";

export function trend(last7?: number, prev7?: number): string {
  const a = last7 ?? 0;
  const b = prev7 ?? 0;
  if (a === 0 && b === 0) return "quiet";
  const d = a - b;
  return d > 0 ? `↑ ${d} vs last week` : d < 0 ? `↓ ${-d} vs last week` : "steady";
}
