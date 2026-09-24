"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { waitUntil } from "@vercel/functions";
import { runEnrichBatch, enrichById } from "@/lib/enrich";
import { reclusterItem } from "@/lib/cluster";
import { ingest, loadChannel } from "@/lib/ingest";
import { supabaseAdmin } from "@/lib/supabase";
import { loadDemoData } from "@/lib/demo";
import { getSession, requireStaff, displayName } from "@/lib/auth-server";
import { audit } from "@/lib/audit";
import { notifyTheme } from "@/lib/notify";
import { createUploadSlots, attachScreenshots, scheduleThemeScreenshotDeletion } from "@/lib/storage";
import { maybeDraftTicket } from "@/lib/tickets";
import type { Category, ThemeStatus } from "@/lib/types";

/** Dashboard "Run enrich" button. */
export async function triggerEnrich(): Promise<void> {
  await requireStaff(["admin", "pm", "engineer"]);
  await runEnrichBatch(10);
  revalidatePath("/");
}

export interface FormState {
  ok: boolean;
  error?: string;
}

/** Signed upload slots for screenshots; the browser uploads directly to storage. */
export async function prepareScreenshotUploads(
  channelId: string,
  files: { name: string; type: string; size: number }[],
): Promise<{ ok: boolean; slots?: { path: string; signedUrl: string }[]; error?: string }> {
  const channel = await loadChannel(channelId);
  if (!channel || channel.type !== "form") return { ok: false, error: "This form is no longer active." };
  try {
    return { ok: true, slots: await createUploadSlots(files) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}

/**
 * The Pulse-hosted form (/f/[channelId]). Signed-in teachers are linked by
 * their verified email; everyone else may leave an email. Classification
 * starts in the background.
 */
export async function submitHostedForm(channelId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const message = String(formData.get("message") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  if (category !== "bug" && category !== "feature") {
    return { ok: false, error: "Please choose whether this is a bug or a feature suggestion." };
  }
  if (!message) return { ok: false, error: "Please describe your feedback." };

  const channel = await loadChannel(channelId);
  if (!channel || channel.type !== "form") return { ok: false, error: "This form is no longer active." };

  const session = await getSession();
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const email = (session?.email && session.email.includes("@") ? session.email : field("email")).toLowerCase();

  const details =
    category === "bug"
      ? [
          field("where") && `Where it happened: ${field("where")}`,
          field("expected") && `Expected: ${field("expected")}`,
          (field("device") || field("browser")) && `Using: ${[field("device"), field("browser")].filter(Boolean).join(", ")}`,
        ].filter(Boolean)
      : [];
  const fullText = details.length ? `${message}\n\n${details.join("\n")}` : message;

  let screenshots: string[] = [];
  try {
    screenshots = category === "bug" ? (JSON.parse(field("screenshots") || "[]") as string[]) : [];
  } catch {
    screenshots = [];
  }

  const payload = {
    message: fullText,
    category,
    where: field("where") || null,
    expected: field("expected") || null,
    device: field("device") || null,
    browser: field("browser") || null,
    email: email || null,
    segment: field("segment") || null,
    nonce: crypto.randomUUID(),
  };

  try {
    const result = await ingest(channel, JSON.stringify(payload), new Headers(), "");
    if (!result.duplicate && result.id) {
      if (screenshots.length) await attachScreenshots(channel.product_id, result.id, screenshots);
      waitUntil(enrichById(result.id).catch(() => undefined));
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Submission failed." };
  }
}

/**
 * PM verification — the final layer (FR-23). If the category changes, the item
 * moves to a theme of the right kind (FR-24).
 */
export async function verifyItem(formData: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = String(formData.get("id") ?? "");
  const category = String(formData.get("category") ?? "") as Category;
  if (!id || !["bug", "feature", "other"].includes(category)) return;

  const db = supabaseAdmin();
  const { data: before } = await db
    .from("feedback")
    .select("product_id, category, review_status, verified_by, verified_at, theme_id")
    .eq("id", id)
    .single();
  if (!before) return;

  const after = { category, review_status: "verified", verified_by: displayName(s), verified_at: new Date().toISOString() };
  await db.from("feedback").update(after).eq("id", id);
  await audit({
    productId: before.product_id,
    actor: displayName(s),
    action: before.category !== category ? `Relabelled item ${before.category} → ${category}` : `Verified item as ${category}`,
    table: "feedback",
    id,
    before: { category: before.category, review_status: before.review_status, verified_by: before.verified_by, verified_at: before.verified_at },
    after,
  });

  if (before.category !== category) await reclusterItem(id);
  const { data: now } = await db.from("feedback").select("theme_id").eq("id", id).single();
  if (now?.theme_id) await maybeDraftTicket(now.theme_id).catch(() => undefined);

  revalidatePath("/review");
  revalidatePath("/");
}

/** Which statuses each kind of theme can take (FR-40, FR-45, FR-46). */
const ALLOWED: Record<string, ThemeStatus[]> = {
  bug: ["open", "being_fixed", "fixed", "not_now"],
  feature: ["open", "planned", "released", "not_now"],
  other: ["open", "not_now"],
};

/**
 * Change a theme's status. "fixed" (engineer confirms it is on production) and
 * "released" email everyone who reported or suggested it.
 */
export async function setThemeStatus(formData: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm", "engineer"]);
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ThemeStatus;
  const db = supabaseAdmin();
  const { data: t } = await db
    .from("themes")
    .select("product_id, category, status, fixed_at, released_at, decided_at, regressed")
    .eq("id", id)
    .single();
  if (!t || !(ALLOWED[t.category] ?? ALLOWED.other).includes(status)) return;

  const now = new Date().toISOString();
  const after: Record<string, unknown> = { status };
  if (status !== "open" && !t.decided_at) after.decided_at = now;
  if (status === "fixed") Object.assign(after, { fixed_at: now, regressed: false });
  if (status === "released") after.released_at = now;
  if (status === "open") after.fixed_at = null;

  await db.from("themes").update(after).eq("id", id);
  await audit({
    productId: t.product_id,
    actor: displayName(s),
    action: `Theme status ${t.status} → ${status}`,
    table: "themes",
    id,
    before: Object.fromEntries(Object.keys(after).map((k) => [k, (t as Record<string, unknown>)[k] ?? null])),
    after,
  });

  if (status === "fixed") {
    await scheduleThemeScreenshotDeletion(id);
    waitUntil(notifyTheme(id, "fixed").then(() => undefined).catch(() => undefined));
  }
  if (status === "released") waitUntil(notifyTheme(id, "released").then(() => undefined).catch(() => undefined));

  revalidatePath(`/themes/${id}`);
  revalidatePath("/");
  revalidatePath("/backlog");
}

/** Owner of a theme (FR-92). */
export async function setThemeOwner(formData: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm", "engineer"]);
  const id = String(formData.get("id") ?? "");
  const owner = String(formData.get("owner") ?? "").trim() || null;
  const db = supabaseAdmin();
  const { data: t } = await db.from("themes").select("product_id, owner").eq("id", id).single();
  if (!t) return;
  await db.from("themes").update({ owner }).eq("id", id);
  await audit({ productId: t.product_id, actor: displayName(s), action: `Owner set to ${owner ?? "nobody"}`, table: "themes", id, before: { owner: t.owner }, after: { owner } });
  revalidatePath(`/themes/${id}`);
  revalidatePath("/backlog");
}

/** Move one report into another theme of the same kind (FR-25). */
export async function moveItem(formData: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = String(formData.get("id") ?? "");
  const target = String(formData.get("target") ?? "");
  const db = supabaseAdmin();
  const { data: item } = await db.from("feedback").select("product_id, theme_id").eq("id", id).single();
  if (!item || !target || target === item.theme_id) return;
  await db.from("feedback").update({ theme_id: target }).eq("id", id);
  await audit({ productId: item.product_id, actor: displayName(s), action: "Moved report to another theme", table: "feedback", id, before: { theme_id: item.theme_id }, after: { theme_id: target } });
  await recomputeAndTidy([item.theme_id, target]);
  revalidatePath(`/themes/${target}`);
  if (item.theme_id) revalidatePath(`/themes/${item.theme_id}`);
}

/** Split one report out into a new theme (FR-25). */
export async function splitItem(formData: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = String(formData.get("id") ?? "");
  const db = supabaseAdmin();
  const { data: item } = await db.from("feedback").select("product_id, theme_id, summary, raw_text, category").eq("id", id).single();
  if (!item) return;
  const { labelTheme } = await import("@/lib/anthropic");
  const { label, summary } = await labelTheme(item.summary ?? "", item.raw_text, item.category ?? "other");
  const { data: created } = await db
    .from("themes")
    .insert({ product_id: item.product_id, label, summary, category: item.category ?? "other", frequency: 0, severity_score: 0 })
    .select("id")
    .single();
  if (!created) return;
  await db.from("feedback").update({ theme_id: created.id }).eq("id", id);
  await audit({ productId: item.product_id, actor: displayName(s), action: "Split report into a new theme", table: "feedback", id, before: { theme_id: item.theme_id }, after: { theme_id: created.id } });
  await recomputeAndTidy([item.theme_id, created.id]);
  redirect(`/themes/${created.id}`);
}

/** Merge a whole theme into another of the same kind (FR-25). */
export async function mergeTheme(formData: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const from = String(formData.get("id") ?? "");
  const into = String(formData.get("target") ?? "");
  if (!from || !into || from === into) return;
  const db = supabaseAdmin();
  const { data: t } = await db.from("themes").select("product_id, label").eq("id", from).single();
  const { data: items } = await db.from("feedback").select("id").eq("theme_id", from);
  for (const it of items ?? []) {
    await db.from("feedback").update({ theme_id: into }).eq("id", it.id);
    await audit({ productId: t?.product_id ?? null, actor: displayName(s), action: `Merged "${t?.label}" into another theme`, table: "feedback", id: it.id, before: { theme_id: from }, after: { theme_id: into } });
  }
  await db.from("tickets").delete().eq("theme_id", from).eq("status", "draft");
  await recomputeAndTidy([from, into]);
  redirect(`/themes/${into}`);
}

async function recomputeAndTidy(themeIds: (string | null)[]) {
  const db = supabaseAdmin();
  for (const tid of themeIds) {
    if (!tid) continue;
    await db.rpc("recompute_theme", { p_theme_id: tid });
    const { count } = await db.from("feedback").select("id", { count: "exact", head: true }).eq("theme_id", tid);
    if (count === 0) {
      const { count: tickets } = await db.from("tickets").select("id", { count: "exact", head: true }).eq("theme_id", tid).eq("status", "filed");
      if (!tickets) await db.from("themes").delete().eq("id", tid);
    }
  }
  revalidatePath("/");
  revalidatePath("/backlog");
}

/** "Load demo data" button. */
export async function seedDemo(): Promise<void> {
  await requireStaff(["admin", "pm"]);
  await loadDemoData();
  await runEnrichBatch(12);
  revalidatePath("/");
  redirect("/");
}
