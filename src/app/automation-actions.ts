"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff, displayName } from "@/lib/auth-server";
import { audit, undoEntry } from "@/lib/audit";
import { createJiraIssue, jiraConfigured } from "@/lib/jira";
import { generateReport, sendReport, type ReportKind } from "@/lib/reports";
import { generateWeeklyActions, generateThemeSuggestion } from "@/lib/insights";
import { getProduct } from "@/lib/product";

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// ── Tickets (FR-93) ──────────────────────────────────────────────────────────

/** File a drafted ticket in Jira in one click (or record it as filed by hand). */
export async function fileTicket(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const s = await requireStaff(["admin", "pm"]);
    const id = String(fd.get("id") ?? "");
    const title = String(fd.get("title") ?? "").trim();
    const body = String(fd.get("body") ?? "").trim();
    const manualKey = String(fd.get("jira_key") ?? "").trim();
    const db = supabaseAdmin();
    const { data: t } = await db.from("tickets").select("*, themes(category)").eq("id", id).single();
    if (!t) return { ok: false, error: "Ticket not found" };

    let key = manualKey || null;
    let url: string | null = null;
    if (!key) {
      if (!jiraConfigured()) return { ok: false, error: "Jira isn't connected. Paste the ticket key after creating it by hand." };
      const created = await createJiraIssue({ title: title || t.title, body: body || t.body, category: t.themes?.category ?? "bug" });
      key = created.key;
      url = created.url;
    } else if (process.env.JIRA_BASE_URL) {
      url = `${process.env.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${key}`;
    }
    const after = { status: "filed", title: title || t.title, body: body || t.body, jira_key: key, url, filed_by: displayName(s), filed_at: new Date().toISOString() };
    await db.from("tickets").update(after).eq("id", id);
    await db.from("themes").update({ decided_at: new Date().toISOString() }).eq("id", t.theme_id).is("decided_at", null);
    await audit({ productId: t.product_id, actor: displayName(s), action: `Filed ticket ${key}`, table: "tickets", id, before: { status: t.status }, after: { status: "filed", jira_key: key } });
    revalidatePath("/tickets");
    revalidatePath(`/themes/${t.theme_id}`);
    return { ok: true, message: `Filed as ${key}` };
  } catch (e) {
    return fail(e);
  }
}

export async function dismissTicket(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = String(fd.get("id") ?? "");
  const db = supabaseAdmin();
  const { data: t } = await db.from("tickets").select("product_id, status, theme_id").eq("id", id).single();
  if (!t) return;
  await db.from("tickets").update({ status: "dismissed" }).eq("id", id);
  await audit({ productId: t.product_id, actor: displayName(s), action: "Dismissed ticket draft", table: "tickets", id, before: { status: t.status }, after: { status: "dismissed" } });
  revalidatePath("/tickets");
  revalidatePath(`/themes/${t.theme_id}`);
}

/** Manually draft a ticket for any theme (ignores the threshold). */
export async function draftTicketNow(fd: FormData): Promise<void> {
  await requireStaff(["admin", "pm"]);
  const themeId = String(fd.get("id") ?? "");
  const db = supabaseAdmin();
  await db.from("tickets").delete().eq("theme_id", themeId).eq("status", "dismissed");
  const { data: theme } = await db.from("themes").select("*").eq("id", themeId).single();
  const { data: stats } = await db.from("theme_stats").select("*").eq("theme_id", themeId).single();
  if (!theme || !stats) return;
  const { data: samples } = await db.from("feedback").select("summary, raw_text").eq("theme_id", themeId).limit(8);
  const { draftTicketText } = await import("@/lib/anthropic");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const d = await draftTicketText({
    label: theme.label,
    category: theme.category,
    summary: theme.summary,
    reporters: stats.reporters,
    items: stats.items,
    channels: stats.channels,
    severity: Number(theme.severity_score),
    samples: (samples ?? []).map((x) => x.summary || x.raw_text),
    themeUrl: `${appUrl}/themes/${themeId}`,
  });
  await db.from("tickets").upsert(
    { product_id: theme.product_id, theme_id: themeId, title: d.title, body: d.body, status: "draft", reports_at_last_update: stats.items },
    { onConflict: "theme_id", ignoreDuplicates: true },
  );
  revalidatePath(`/themes/${themeId}`);
  revalidatePath("/tickets");
}

// ── Reports (FR-94) ──────────────────────────────────────────────────────────

export async function generateReportNow(fd: FormData): Promise<void> {
  await requireStaff(["admin", "pm"]);
  const kind = String(fd.get("kind") ?? "weekly") as ReportKind;
  const product = await getProduct();
  if (!product) return;
  await generateReport(product.id, kind === "monthly" ? "monthly" : "weekly");
  revalidatePath("/reports");
}

export async function saveReport(fd: FormData): Promise<void> {
  await requireStaff(["admin", "pm"]);
  const id = String(fd.get("id") ?? "");
  await supabaseAdmin()
    .from("reports")
    .update({ content: String(fd.get("content") ?? ""), recipients: String(fd.get("recipients") ?? "") })
    .eq("id", id);
  revalidatePath("/reports");
}

export async function sendReportNow(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const s = await requireStaff(["admin", "pm"]);
    const id = String(fd.get("id") ?? "");
    await supabaseAdmin()
      .from("reports")
      .update({ content: String(fd.get("content") ?? ""), recipients: String(fd.get("recipients") ?? "") })
      .eq("id", id);
    const r = await sendReport(id, displayName(s));
    revalidatePath("/reports");
    if (r.status === "no_provider") return { ok: false, error: "Email isn't set up yet (RESEND_API_KEY and EMAIL_FROM). Copy the text instead." };
    return { ok: true, message: "Sent." };
  } catch (e) {
    return fail(e);
  }
}

// ── AI suggestions (FR-34) ───────────────────────────────────────────────────

export async function refreshWeeklyActions(): Promise<void> {
  await requireStaff(["admin", "pm"]);
  const product = await getProduct();
  if (product) await generateWeeklyActions(product.id);
  revalidatePath("/");
}

export async function suggestForTheme(fd: FormData): Promise<void> {
  await requireStaff(["admin", "pm", "engineer"]);
  const id = String(fd.get("id") ?? "");
  await generateThemeSuggestion(id);
  revalidatePath(`/themes/${id}`);
}

// ── Oversight: undo (FR-95) ──────────────────────────────────────────────────

export async function undoAction(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = Number(fd.get("id"));
  const r = await undoEntry(id);
  if (r.ok) {
    const db = supabaseAdmin();
    for (const t of r.themeIds) await db.rpc("recompute_theme", { p_theme_id: t });
    await audit({ productId: null, actor: displayName(s), action: `Undid activity #${id}` });
  }
  revalidatePath("/activity");
  revalidatePath("/");
}
