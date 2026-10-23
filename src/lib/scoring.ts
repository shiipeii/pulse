/**
 * The PM prioritisation layer's four signals (spec: "How Pulse decides what
 * matters"). Pure functions only, so they can be unit-tested without a
 * database. `scoring-run.ts` loads the inputs and saves the results.
 *
 *   Urgency    must someone act today?            → skips the matrix ("Act now")
 *   Impact     how much it matters, 1–10          → vertical axis
 *   Effort     S / M / L / XL                      → horizontal axis
 *   Frequency  reports and people, 14 days + total → evidence everywhere
 *
 *   Priority = impact ÷ effort weight (S 1, M 2, L 4, XL 8)
 */

export type Effort = "s" | "m" | "l" | "xl";
export type Decision = "now" | "next" | "later" | "not_now";
export type Quadrant = "quick_win" | "big_bet" | "fill_in" | "not_worth_it";

export const EFFORTS: Effort[] = ["s", "m", "l", "xl"];
export const DECISIONS: Decision[] = ["now", "next", "later", "not_now"];

export const EFFORT_WEIGHT: Record<Effort, number> = { s: 1, m: 2, l: 4, xl: 8 };
export const EFFORT_LABEL: Record<Effort, string> = { s: "S", m: "M", l: "L", xl: "XL" };
export const EFFORT_HINT: Record<Effort, string> = {
  s: "2 days or less",
  m: "about a week",
  l: "about a sprint",
  xl: "more than a sprint",
};
export const DECISION_LABEL: Record<Decision, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
  not_now: "Not now",
};

/** Quadrant line: impact at or above this is "high impact". */
export const IMPACT_LINE = Number(process.env.IMPACT_LINE ?? "6");
/** Spike: this many reports in 24 hours… */
export const SPIKE_COUNT = Number(process.env.SPIKE_COUNT ?? "5");
/** …or this multiple of the usual daily rate (with at least 3 reports). */
export const SPIKE_MULTIPLE = Number(process.env.SPIKE_MULTIPLE ?? "3");
/** People at which reach is treated as "everyone we'd expect to hear from". */
export const REACH_CAP = 30;

export function isEffort(v: unknown): v is Effort {
  return typeof v === "string" && (EFFORTS as string[]).includes(v);
}
export function isDecision(v: unknown): v is Decision {
  return typeof v === "string" && (DECISIONS as string[]).includes(v);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ImpactInput {
  /** Distinct people who reported it. */
  people: number;
  /** Distinct schools (or school levels when schools aren't known). */
  schools: number;
  /** Average severity of its reports, 1 (low) to 4 (critical); 0 when unknown. */
  severity: number;
  /** Reports in the last 14 days, and in the 14 days before that. */
  last14: number;
  prev14: number;
  /** The PM ticked "fits this term's goals". */
  fitsGoals: boolean;
}

export interface ImpactParts {
  reach: number;
  severity: number;
  momentum: number;
  fit: number;
  impact: number;
}

/**
 * Impact, 1–10: 40% reach, 30% severity, 20% momentum, 10% fit.
 * Each part is 0–1 before weighting.
 */
export function impactScore(i: ImpactInput): ImpactParts {
  const peopleReach = Math.log(1 + Math.max(0, i.people)) / Math.log(1 + REACH_CAP);
  const schoolReach = Math.log(1 + Math.max(0, i.schools)) / Math.log(1 + REACH_CAP / 2);
  const reach = clamp01(0.7 * peopleReach + 0.3 * schoolReach);
  const severity = i.severity > 0 ? clamp01((i.severity - 1) / 3) : 0;
  const top = Math.max(i.last14, i.prev14, 1);
  // 0.5 = steady, 1 = doubled or new, 0 = stopped.
  const momentum = clamp01(0.5 + (i.last14 - i.prev14) / (2 * top));
  const fit = i.fitsGoals ? 1 : 0;
  const weighted = 0.4 * reach + 0.3 * severity + 0.2 * momentum + 0.1 * fit;
  return {
    reach: round1(reach * 10) / 10,
    severity: round1(severity * 10) / 10,
    momentum: round1(momentum * 10) / 10,
    fit,
    impact: round1(1 + 9 * weighted),
  };
}

/** Priority score; null when the issue still needs sizing. */
export function priority(impact: number | null | undefined, effort: Effort | null | undefined): number | null {
  if (impact == null || !effort) return null;
  return Math.round((impact / EFFORT_WEIGHT[effort]) * 100) / 100;
}

/** Where a sized issue sits on the impact-effort matrix. */
export function quadrant(impact: number, effort: Effort): Quadrant {
  const high = impact >= IMPACT_LINE;
  const cheap = effort === "s" || effort === "m";
  if (high && cheap) return "quick_win";
  if (high) return "big_bet";
  if (cheap) return "fill_in";
  return "not_worth_it";
}

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  quick_win: "Quick wins",
  big_bet: "Big bets",
  fill_in: "Fill-ins",
  not_worth_it: "Not worth it",
};
export const QUADRANT_HINT: Record<Quadrant, string> = {
  quick_win: "High impact, little work. Do these first.",
  big_bet: "High impact, a lot of work. Plan them.",
  fill_in: "Low impact, little work. Fit them in.",
  not_worth_it: "Low impact, a lot of work. Usually Not now.",
};

export interface UrgencyInput {
  isClosed: boolean;
  regressed: boolean;
  /** Dates of critical reports, and of reports mentioning data loss or safety. */
  criticalAt: string[];
  riskAt: string[];
  /** Report dates (ISO), all reports in the issue. */
  reportDates: string[];
  /** When the PM last cleared the flag. */
  clearedAt: string | null;
  /** When the issue was last marked fixed (a regression signal starts after it). */
  fixedAt: string | null;
  now?: Date;
}

export interface Urgency {
  urgent: boolean;
  reason: string | null;
  /** When the newest urgent signal happened. */
  since: string | null;
}

const DAY = 86_400_000;
const RISK_WORDS =
  /\b(data (?:loss|lost)|lost (?:all|every|my|the)|disappear(?:ed|s)?|wiped|deleted|safety|unsafe|injur(?:y|ed)|wrong student|privacy|leak(?:ed)?)\b/i;

/** Does a report's text mention data loss or a safety risk? */
export function mentionsRisk(text: string): boolean {
  return RISK_WORDS.test(text);
}

/**
 * Urgent if any is true, and newer than the PM's last "clear":
 * a critical report in 14 days, it came back after a fix, it mentions data
 * loss or safety (14 days), or reports spike (5+ in 24h, or 3× the usual rate).
 */
export function urgency(u: UrgencyInput): Urgency {
  if (u.isClosed) return { urgent: false, reason: null, since: null };
  const now = (u.now ?? new Date()).getTime();
  const cleared = u.clearedAt ? new Date(u.clearedAt).getTime() : 0;
  const recent = (iso: string, days: number) => now - new Date(iso).getTime() <= days * DAY;
  const signals: { at: number; reason: string }[] = [];

  const crit = u.criticalAt.filter((d) => recent(d, 14)).sort();
  if (crit.length) signals.push({ at: new Date(crit[crit.length - 1]).getTime(), reason: `${crit.length} critical report${crit.length > 1 ? "s" : ""} in the last 14 days` });

  if (u.regressed) {
    const fixed = u.fixedAt ? new Date(u.fixedAt).getTime() : 0;
    const after = u.reportDates.map((d) => new Date(d).getTime()).filter((t) => t > fixed).sort((a, b) => a - b);
    const at = after.length ? after[after.length - 1] : now;
    signals.push({ at, reason: "Came back after it was fixed" });
  }

  const risk = u.riskAt.filter((d) => recent(d, 14)).sort();
  if (risk.length) signals.push({ at: new Date(risk[risk.length - 1]).getTime(), reason: "Mentions lost data or a safety risk" });

  const times = u.reportDates.map((d) => new Date(d).getTime());
  const day = times.filter((t) => now - t <= DAY).length;
  const prior = times.filter((t) => now - t > DAY && now - t <= 29 * DAY).length;
  const usual = prior / 28;
  if (day >= SPIKE_COUNT || (day >= 3 && usual > 0 && day >= SPIKE_MULTIPLE * usual)) {
    signals.push({ at: Math.max(...times.filter((t) => now - t <= DAY)), reason: `${day} reports in the last 24 hours` });
  }

  const live = signals.filter((s) => s.at > cleared).sort((a, b) => b.at - a.at);
  if (!live.length) return { urgent: false, reason: null, since: null };
  return { urgent: true, reason: live.map((s) => s.reason).join(" · "), since: new Date(live[0].at).toISOString() };
}

/** The most common value, ignoring blanks; ties go to the first seen. */
export function mode(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  counts.forEach((c, v) => {
    if (c > n) {
      best = v;
      n = c;
    }
  });
  return best;
}
