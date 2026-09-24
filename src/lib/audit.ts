import { supabaseAdmin } from "./supabase";

/**
 * Audit trail with undo (NFR-14, FR-95). Each entry records a single-row
 * change: which table/row, the fields before and after. Undo writes `before`
 * back, but only if the row still matches `after` (nobody changed it since).
 */
export async function audit(entry: {
  productId: string | null;
  actor: string;
  action: string;
  table?: string;
  id?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): Promise<void> {
  await supabaseAdmin()
    .from("audit_log")
    .insert({
      product_id: entry.productId,
      actor: entry.actor,
      action: entry.action,
      target_table: entry.table ?? null,
      target_id: entry.id ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
}

/** Tables whose single-row changes can be undone. */
export const UNDOABLE_TABLES = ["feedback", "themes"] as const;

export async function undoEntry(id: number): Promise<{ ok: boolean; error?: string; themeIds: string[] }> {
  const db = supabaseAdmin();
  const { data: e } = await db.from("audit_log").select("*").eq("id", id).single();
  if (!e) return { ok: false, error: "Entry not found", themeIds: [] };
  if (e.undone) return { ok: false, error: "Already undone", themeIds: [] };
  if (!e.before || !e.after || !UNDOABLE_TABLES.includes(e.target_table)) {
    return { ok: false, error: "This action can't be undone automatically", themeIds: [] };
  }
  const fields = Object.keys(e.after as Record<string, unknown>);
  const { data: row } = await db.from(e.target_table).select(fields.join(",")).eq("id", e.target_id).maybeSingle();
  if (!row) return { ok: false, error: "The item no longer exists", themeIds: [] };
  const current = row as unknown as Record<string, unknown>;
  const changedSince = fields.some((f) => JSON.stringify(current[f]) !== JSON.stringify((e.after as Record<string, unknown>)[f]));
  if (changedSince) return { ok: false, error: "Someone changed this since, so it wasn't undone", themeIds: [] };

  const { error } = await db.from(e.target_table).update(e.before).eq("id", e.target_id);
  if (error) return { ok: false, error: error.message, themeIds: [] };
  await db.from("audit_log").update({ undone: true }).eq("id", id);

  const themeIds = [
    (e.before as Record<string, unknown>).theme_id,
    (e.after as Record<string, unknown>).theme_id,
    e.target_table === "themes" ? e.target_id : null,
  ].filter((x): x is string => typeof x === "string");
  return { ok: true, themeIds };
}
