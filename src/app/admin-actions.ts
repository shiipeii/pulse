"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff, displayName } from "@/lib/auth-server";
import { audit } from "@/lib/audit";
import { getProduct } from "@/lib/product";
import { signValue } from "@/lib/session";
import type { StaffRole } from "@/lib/types";


// ── Staff accounts (FR-81) ───────────────────────────────────────────────────

export async function addStaff(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin"]);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim() || null;
  const role = String(fd.get("role") ?? "pm") as StaffRole;
  if (!email.includes("@") || !["admin", "pm", "engineer", "stakeholder"].includes(role)) return;
  await supabaseAdmin().from("staff").upsert({ email, name, role });
  await audit({ productId: null, actor: displayName(s), action: `Gave ${email} ${role} access` });
  revalidatePath("/admin/staff");
}

export async function removeStaff(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin"]);
  const email = String(fd.get("email") ?? "");
  await supabaseAdmin().from("staff").delete().eq("email", email);
  await audit({ productId: null, actor: displayName(s), action: `Removed access for ${email}` });
  revalidatePath("/admin/staff");
}

// ── Source register (FR-90) ──────────────────────────────────────────────────

export async function addSource(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const product = await getProduct();
  if (!product) return;
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return;
  const row = {
    product_id: product.id,
    name,
    kind: String(fd.get("kind") ?? "other"),
    owner: String(fd.get("owner") ?? "").trim() || null,
    notes: String(fd.get("notes") ?? "").trim() || null,
    status: "not_connected",
  };
  await supabaseAdmin().from("sources").insert(row);
  await audit({ productId: product.id, actor: displayName(s), action: `Added source "${name}" to the register` });
  revalidatePath("/sources");
}

export async function updateSource(fd: FormData): Promise<void> {
  await requireStaff(["admin", "pm"]);
  const id = String(fd.get("id") ?? "");
  const patch: Record<string, unknown> = {};
  for (const k of ["owner", "status", "notes", "kind"]) {
    const v = fd.get(k);
    if (v !== null) patch[k] = String(v).trim() || null;
  }
  if (patch.status === null) delete patch.status;
  if (patch.kind === null) delete patch.kind;
  await supabaseAdmin().from("sources").update(patch).eq("id", id);
  revalidatePath("/sources");
}

export async function deleteSource(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = String(fd.get("id") ?? "");
  const { data } = await supabaseAdmin().from("sources").select("name, product_id, channel_id").eq("id", id).single();
  if (!data || data.channel_id) return; // connected channels are managed on Channels
  await supabaseAdmin().from("sources").delete().eq("id", id);
  await audit({ productId: data.product_id, actor: displayName(s), action: `Removed source "${data.name}"` });
  revalidatePath("/sources");
}

// ── Unsubscribe (FR-62) — public, signed link ────────────────────────────────

export async function unsubscribe(fd: FormData): Promise<void> {
  const email = String(fd.get("e") ?? "").toLowerCase();
  const sig = String(fd.get("s") ?? "");
  if (!email || sig !== (await signValue(email))) return;
  await supabaseAdmin().from("email_optouts").upsert({ email });
  revalidatePath("/unsubscribe");
}
