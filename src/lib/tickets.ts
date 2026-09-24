import { supabaseAdmin } from "./supabase";
import { draftTicketText } from "./anthropic";
import { commentOnJiraIssue, jiraConfigured } from "./jira";
import type { ThemeStats } from "./types";

/**
 * Automated ticketing (FR-93). A ticket is DRAFTED automatically when a theme
 * with at least one PM-verified item has ≥ TICKET_THRESHOLD reports, or any
 * critical bug report. A person files it in one click; Pulse never files alone.
 */
const THRESHOLD = Number(process.env.TICKET_THRESHOLD ?? "5");

export async function afterItemClustered(themeId: string): Promise<void> {
  await maybeDraftTicket(themeId);
}

export async function maybeDraftTicket(themeId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from("tickets").select("id").eq("theme_id", themeId).maybeSingle();
  if (existing) return false;

  const { data: theme } = await db.from("themes").select("*").eq("id", themeId).single();
  if (!theme || theme.category === "other" || ["fixed", "released", "not_now"].includes(theme.status)) return false;

  const { data: stats } = await db.from("theme_stats").select("*").eq("theme_id", themeId).single();
  const s = stats as ThemeStats | null;
  if (!s || !s.any_verified) return false;

  const { count: critical } = await db
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("theme_id", themeId)
    .eq("severity", "critical");
  const crosses = s.items >= THRESHOLD || (theme.category === "bug" && (critical ?? 0) > 0);
  if (!crosses) return false;

  const { data: samples } = await db
    .from("feedback")
    .select("summary, raw_text")
    .eq("theme_id", themeId)
    .order("received_at", { ascending: false })
    .limit(8);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const draft = await draftTicketText({
    label: theme.label,
    category: theme.category,
    summary: theme.summary,
    reporters: s.reporters,
    items: s.items,
    channels: s.channels,
    severity: Number(theme.severity_score),
    samples: (samples ?? []).map((x) => x.summary || x.raw_text),
    themeUrl: `${appUrl}/themes/${themeId}`,
  });

  const { error } = await db.from("tickets").insert({
    product_id: theme.product_id,
    theme_id: themeId,
    title: draft.title,
    body: draft.body,
    reports_at_last_update: s.items,
  });
  return !error;
}

/**
 * Daily: post a comment to each filed Jira ticket whose theme has new reports
 * since the last update, so tickets stay current as reports arrive.
 */
export async function syncFiledTickets(): Promise<number> {
  if (!jiraConfigured()) return 0;
  const db = supabaseAdmin();
  const { data: tickets } = await db.from("tickets").select("*").eq("status", "filed").not("jira_key", "is", null);
  let updated = 0;
  for (const t of tickets ?? []) {
    const { data: s } = await db.from("theme_stats").select("items, reporters, last7").eq("theme_id", t.theme_id).single();
    if (!s || s.items <= t.reports_at_last_update) continue;
    const added = s.items - t.reports_at_last_update;
    try {
      await commentOnJiraIssue(
        t.jira_key,
        `Pulse update: ${added} new report(s) since the last update. Now ${s.items} reports from ${s.reporters} people (${s.last7} in the last 7 days).`,
      );
      await db.from("tickets").update({ reports_at_last_update: s.items }).eq("id", t.id);
      updated += 1;
    } catch {
      // try again tomorrow
    }
  }
  return updated;
}
