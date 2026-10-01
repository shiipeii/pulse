import type { ThemeStatus } from "./types";

/** Staff-facing status labels. */
export const STATUS_LABEL: Record<ThemeStatus, string> = {
  open: "Open",
  being_fixed: "Being fixed",
  fixed: "Fixed",
  planned: "Planned (team only)",
  not_now: "Not now (team only)",
  released: "Released",
};

/** One meaning per colour: neutral open, blue in progress, green done, dashed purple team-only. */
export const STATUS_STYLE: Record<ThemeStatus, string> = {
  open: "bg-[#EEF1F4] text-[#475569]",
  being_fixed: "bg-[#E6EEFD] text-[#1D4ED8]",
  fixed: "bg-[#E3F3E8] text-[#1E6B3A]",
  planned: "bg-white text-[#5B3FA8] border border-dashed border-[#5B3FA8]",
  not_now: "bg-white text-[#5B3FA8] border border-dashed border-[#5B3FA8]",
  released: "bg-[#E3F3E8] text-[#1E6B3A]",
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
