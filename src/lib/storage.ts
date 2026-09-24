import crypto from "crypto";
import { supabaseAdmin } from "./supabase";

/** Private bucket for bug screenshots (FR-13, NFR-8, NFR-12). */
export const BUCKET = "screenshots";
export const MAX_FILES = 3;
export const MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/heic", "image/heif", "image/webp"];
export const RETENTION_DAYS = Number(process.env.SCREENSHOT_RETENTION_DAYS ?? "90");

/** Signed upload slots: the browser uploads straight to storage (bypasses the 4.5 MB request limit). */
export async function createUploadSlots(files: { name: string; type: string; size: number }[]) {
  if (files.length > MAX_FILES) throw new Error(`Up to ${MAX_FILES} screenshots.`);
  const db = supabaseAdmin();
  const slots: { path: string; signedUrl: string }[] = [];
  for (const f of files) {
    if (!ALLOWED_TYPES.includes(f.type)) throw new Error("Screenshots must be PNG, JPG, HEIC or WebP images.");
    if (f.size > MAX_BYTES) throw new Error("Each screenshot must be 5 MB or smaller.");
    const safe = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60) || "screenshot";
    const path = `pending/${crypto.randomUUID()}/${safe}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Upload setup failed: ${error?.message ?? "unknown"}`);
    slots.push({ path, signedUrl: data.signedUrl });
  }
  return slots;
}

/** Move uploaded files under the item and record them. Invalid paths are ignored. */
export async function attachScreenshots(productId: string, feedbackId: string, paths: string[]) {
  const db = supabaseAdmin();
  for (const p of paths.slice(0, MAX_FILES)) {
    if (!/^pending\/[0-9a-f-]{36}\/[a-z0-9.-]+$/.test(p)) continue;
    const dest = `fb/${feedbackId}/${p.split("/").slice(1).join("-")}`;
    const { error } = await db.storage.from(BUCKET).move(p, dest);
    if (error) continue;
    await db.from("attachments").insert({ product_id: productId, feedback_id: feedbackId, path: dest });
  }
}

/** Short-lived viewing links for staff (NFR-8: ≤ 10 minutes). */
export async function signedViewUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabaseAdmin().storage.from(BUCKET).createSignedUrls(paths, 600);
  const out: Record<string, string> = {};
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  });
  return out;
}

/** When a bug is fixed, its screenshots are scheduled for deletion. */
export async function scheduleThemeScreenshotDeletion(themeId: string) {
  const db = supabaseAdmin();
  const { data: items } = await db.from("feedback").select("id").eq("theme_id", themeId);
  const ids = (items ?? []).map((i) => i.id);
  if (ids.length === 0) return;
  const when = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();
  await db.from("attachments").update({ delete_after: when }).in("feedback_id", ids).is("delete_after", null);
}

/** Daily clean-up: expired screenshots and abandoned uploads older than a day. */
export async function purgeScreenshots(): Promise<{ expired: number; abandoned: number }> {
  const db = supabaseAdmin();
  const { data: expired } = await db
    .from("attachments")
    .select("id, path")
    .lt("delete_after", new Date().toISOString())
    .limit(500);
  if (expired && expired.length) {
    await db.storage.from(BUCKET).remove(expired.map((a) => a.path));
    await db.from("attachments").delete().in("id", expired.map((a) => a.id));
  }

  let abandoned = 0;
  const { data: folders } = await db.storage.from(BUCKET).list("pending", { limit: 200 });
  const cutoff = Date.now() - 86_400_000;
  for (const folder of folders ?? []) {
    const { data: files } = await db.storage.from(BUCKET).list(`pending/${folder.name}`);
    const old = (files ?? []).filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff);
    if (old.length) {
      await db.storage.from(BUCKET).remove(old.map((f) => `pending/${folder.name}/${f.name}`));
      abandoned += old.length;
    }
  }
  return { expired: expired?.length ?? 0, abandoned };
}
