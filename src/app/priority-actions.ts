"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff, displayName } from "@/lib/auth-server";
import { audit } from "@/lib/audit";
import { rescoreTheme } from "@/lib/scoring-run";
import { isDecision, isEffort, EFFORT_LABEL, DECISION_LABEL } from "@/lib/scoring";

/** Actions behind the prioritisation layer: size, decide, clear urgent, goals. */

const NEEDS_UPGRADE = "Pulse's database needs an upgrade: run supabase/UPGRADE_TO_V0.4.sql in the Supabase SQL Editor.";

function refresh(id: string) {
  revalidatePath("/");
  revalidatePath("/priorities");
  revalidatePath(`/themes/${id}`);
}

/** Effort size. Engineers size the issues they own; PMs can too. */
export async function setEffort(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm", "engineer"]);
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("effort") ?? "");
  const effort = raw === "" ? null : raw;
  if (effort !== null && !isEffort(effort)) return;
  const db = supabaseAdmin();
  const { data: t } = await db.from("themes").select("*").eq("id", id).single();
  if (!t) return;
  const after = {
    effort,
    effort_source: effort ? (s.role === "engineer" ? "engineer" : "pm") : null,
    effort_set_by: effort ? displayName(s) : null,
    effort_set_at: effort ? new Date().toISOString() : null,
  };
  const { error } = await db.from("themes").update(after).eq("id", id);
  if (error) throw new Error(NEEDS_UPGRADE);
  await audit({
    productId: t.product_id,
    actor: displayName(s),
    action: effort ? `Sized "${t.label}" as ${EFFORT_LABEL[effort]}` : `Cleared the size of "${t.label}"`,
    table: "themes",
    id,
    before: { effort: t.effort ?? null, effort_source: t.effort_source ?? null, effort_set_by: t.effort_set_by ?? null, effort_set_at: t.effort_set_at ?? null },
    after,
  });
  refresh(id);
}

/** PM decision: Now, Next, Later or Not now (or cleared). */
export async function setDecision(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("decision") ?? "");
  const decision = raw === "" ? null : raw;
  if (decision !== null && !isDecision(decision)) return;
  const db = supabaseAdmin();
  const { data: t } = await db.from("themes").select("*").eq("id", id).single();
  if (!t) return;
  const after: Record<string, unknown> = { decision, decided_by: decision ? displayName(s) : null };
  // A decision counts toward the 14-day decision rate.
  if (decision && !t.decided_at) after.decided_at = new Date().toISOString();
  const { error } = await db.from("themes").update(after).eq("id", id);
  if (error) throw new Error(NEEDS_UPGRADE);
  await audit({
    productId: t.product_id,
    actor: displayName(s),
    action: decision ? `Decided "${t.label}": ${DECISION_LABEL[decision]}` : `Cleared the decision on "${t.label}"`,
    table: "themes",
    id,
    before: { decision: t.decision ?? null, decided_by: t.decided_by ?? null, ...(after.decided_at ? { decided_at: t.decided_at } : {}) },
    after,
  });
  refresh(id);
}

/** PM clears an urgent flag; it comes back only on a new urgent signal. */
export async function clearUrgent(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = String(fd.get("id") ?? "");
  const db = supabaseAdmin();
  const { data: t } = await db.from("themes").select("*").eq("id", id).single();
  if (!t) return;
  const after = { urgent: false, urgent_cleared_at: new Date().toISOString() };
  const { error } = await db.from("themes").update(after).eq("id", id);
  if (error) throw new Error(NEEDS_UPGRADE);
  await audit({
    productId: t.product_id,
    actor: displayName(s),
    action: `Cleared urgent on "${t.label}"`,
    table: "themes",
    id,
    before: { urgent: t.urgent ?? false, urgent_cleared_at: t.urgent_cleared_at ?? null },
    after,
  });
  refresh(id);
}

/** PM ticks whether an issue fits this term's goals (10% of impact). */
export async function setFitsGoals(fd: FormData): Promise<void> {
  const s = await requireStaff(["admin", "pm"]);
  const id = String(fd.get("id") ?? "");
  const fits = String(fd.get("fits") ?? "") === "1";
  const db = supabaseAdmin();
  const { data: t } = await db.from("themes").select("*").eq("id", id).single();
  if (!t) return;
  const { error } = await db.from("themes").update({ fits_goals: fits }).eq("id", id);
  if (error) throw new Error(NEEDS_UPGRADE);
  await audit({
    productId: t.product_id,
    actor: displayName(s),
    action: `${fits ? "Marked" : "Unmarked"} "${t.label}" as fitting this term's goals`,
    table: "themes",
    id,
    before: { fits_goals: t.fits_goals ?? false },
    after: { fits_goals: fits },
  });
  await rescoreTheme(id);
  refresh(id);
}
