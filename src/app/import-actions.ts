"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff, displayName } from "@/lib/auth-server";
import { insertNormalised } from "@/lib/ingest";
import { generateIngestToken } from "@/lib/channels";
import { getProduct } from "@/lib/product";
import { audit } from "@/lib/audit";
import { extractEmail, type Channel, type UserCategory } from "@/lib/types";

export interface ImportMapping {
  text: string[];
  author?: string;
  date?: string;
  category?: string;
  id?: string;
}

export interface ImportRow {
  text: string;
  author?: string;
  date?: string;
  category?: string;
  id?: string;
}

/**
 * CSV / Excel import (FR-91). The browser parses the file and maps columns;
 * rows arrive in batches. Each source gets its own "import" channel, and the
 * mapping is saved on the source so the next file maps itself.
 */
export async function importBatch(args: {
  sourceId?: string;
  newSourceName?: string;
  newSourceKind?: string;
  mapping: ImportMapping;
  rows: ImportRow[];
  fileName: string;
}): Promise<{ ok: boolean; sourceId?: string; added?: number; duplicates?: number; skipped?: number; error?: string }> {
  try {
    const s = await requireStaff(["admin", "pm"]);
    const product = await getProduct();
    if (!product) return { ok: false, error: "No product" };
    const db = supabaseAdmin();

    let sourceId = args.sourceId;
    if (!sourceId) {
      const name = (args.newSourceName ?? "").trim();
      if (!name) return { ok: false, error: "Name the source first." };
      const { data, error } = await db
        .from("sources")
        .insert({ product_id: product.id, name, kind: args.newSourceKind ?? "survey", status: "imported" })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      sourceId = data.id;
    }
    const { data: source } = await db.from("sources").select("*").eq("id", sourceId).single();
    if (!source) return { ok: false, error: "Source not found" };

    let channelId: string | null = source.channel_id;
    if (!channelId) {
      const { data: ch, error } = await db
        .from("channels")
        .insert({
          product_id: product.id,
          name: `${source.name} (import)`,
          type: "import",
          decoder: "import",
          mapping_config: {},
          ingest_token: generateIngestToken(),
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      channelId = ch.id;
    }
    await db.from("sources").update({ channel_id: channelId, status: "imported", import_mapping: args.mapping }).eq("id", sourceId);
    const { data: channel } = await db.from("channels").select("*").eq("id", channelId).single();

    let added = 0;
    let duplicates = 0;
    let skipped = 0;
    for (const r of args.rows.slice(0, 500)) {
      const text = (r.text ?? "").trim();
      if (!text) {
        skipped += 1;
        continue;
      }
      const when = r.date ? new Date(r.date) : null;
      const cat = (r.category ?? "").toLowerCase();
      const category: UserCategory | null = cat.includes("bug") ? "bug" : cat.includes("feature") || cat.includes("suggest") ? "feature" : null;
      const sourceMsgId =
        (r.id ?? "").trim() ||
        crypto.createHash("sha256").update(`${text}|${r.author ?? ""}|${r.date ?? ""}`).digest("hex").slice(0, 32);
      const res = await insertNormalised(channel as Channel, {
        sourceMsgId,
        text: text.slice(0, 20000),
        author: r.author?.trim() || null,
        submitterEmail: extractEmail(r.author),
        category,
        receivedAt: when && !isNaN(when.getTime()) ? when.toISOString() : undefined,
        rawPayload: { import: args.fileName, row: r },
      });
      if (res.duplicate) duplicates += 1;
      else added += 1;
    }
    await audit({ productId: product.id, actor: displayName(s), action: `Imported ${added} items from ${args.fileName} into "${source.name}"` });
    revalidatePath("/sources");
    revalidatePath("/");
    return { ok: true, sourceId, added, duplicates, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
