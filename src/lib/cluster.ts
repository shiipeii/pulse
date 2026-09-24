import { supabaseAdmin } from "./supabase";
import { labelTheme } from "./anthropic";
import { toVectorLiteral } from "./embeddings";
import type { Category } from "./types";

/**
 * Cosine-distance threshold for attaching an item to an existing theme.
 * `<=>` returns cosine distance (0 = identical). Below the threshold → same
 * theme; otherwise → spin up a new one. Tunable (PRD §13 open question).
 */
const THEME_DISTANCE_THRESHOLD = Number(process.env.THEME_DISTANCE_THRESHOLD ?? "0.25");

/**
 * Cluster one enriched feedback item: nearest theme of the SAME category
 * (bugs never merge with feature requests). Attach if close enough, else
 * create a new theme. A new report on a FIXED bug theme reopens it and flags
 * a regression.
 */
export async function clusterFeedback(args: {
  feedbackId: string;
  productId: string;
  embedding: number[];
  summary: string;
  rawText: string;
  category: Category;
  receivedAt: string;
}): Promise<{ themeId: string; created: boolean }> {
  const db = supabaseAdmin();
  const vec = toVectorLiteral(args.embedding);

  // 1. Find the nearest existing theme in this tenant + category.
  const { data: matches, error: matchErr } = await db.rpc("match_theme", {
    p_product_id: args.productId,
    p_embedding: vec,
    p_limit: 1,
    p_category: args.category,
  });
  if (matchErr) throw new Error(`match_theme failed: ${matchErr.message}`);

  const nearest = matches?.[0] as { id: string; distance: number } | undefined;

  let themeId: string;
  let created = false;

  if (nearest && nearest.distance <= THEME_DISTANCE_THRESHOLD) {
    themeId = nearest.id;
  } else {
    // 2. New theme — label it for a legible dashboard.
    const { label, summary } = await labelTheme(args.summary, args.rawText, args.category);
    const { data: inserted, error: insErr } = await db
      .from("themes")
      .insert({
        product_id: args.productId,
        label,
        summary,
        centroid: vec,
        frequency: 0,
        severity_score: 0,
        category: args.category,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`theme insert failed: ${insErr.message}`);
    themeId = inserted.id;
    created = true;
  }

  // 3. Attach the item.
  const { error: updErr } = await db
    .from("feedback")
    .update({ theme_id: themeId, status: "clustered" })
    .eq("id", args.feedbackId);
  if (updErr) throw new Error(`attach feedback failed: ${updErr.message}`);

  // 4. Regression check: a fresh report on a theme marked fixed reopens it.
  if (!created) {
    const { data: theme } = await db
      .from("themes")
      .select("status, fixed_at")
      .eq("id", themeId)
      .single();
    if (theme?.status === "fixed" && theme.fixed_at && args.receivedAt > theme.fixed_at) {
      await db.from("themes").update({ status: "open", regressed: true }).eq("id", themeId);
      // Allow reporters to be told again once the regression is fixed.
      await db.from("notifications").delete().eq("theme_id", themeId).eq("kind", "fixed");
    }
  }

  // 5. Recompute the theme's frequency / severity_score / centroid / sentiment.
  const { error: recErr } = await db.rpc("recompute_theme", { p_theme_id: themeId });
  if (recErr) throw new Error(`recompute_theme failed: ${recErr.message}`);

  return { themeId, created };
}

/**
 * Move an item to the right theme after a PM changes its category. Uses the
 * stored embedding (no new AI embedding call), then tidies the old theme.
 */
export async function reclusterItem(feedbackId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from("feedback")
    .select("id, product_id, theme_id, embedding, summary, raw_text, category, received_at")
    .eq("id", feedbackId)
    .single();
  if (error || !row) throw new Error(`recluster: item not found`);
  if (!row.embedding || !row.category) return; // not enriched yet — enrich will cluster it

  const oldThemeId = row.theme_id as string | null;
  const embedding: number[] =
    typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding;

  // Detach first so the old theme's rollups exclude this item.
  await db.from("feedback").update({ theme_id: null }).eq("id", feedbackId);
  if (oldThemeId) {
    await db.rpc("recompute_theme", { p_theme_id: oldThemeId });
    // Remove a theme that is now empty.
    const { count } = await db
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("theme_id", oldThemeId);
    if (count === 0) await db.from("themes").delete().eq("id", oldThemeId);
  }

  await clusterFeedback({
    feedbackId,
    productId: row.product_id,
    embedding,
    summary: row.summary ?? "",
    rawText: row.raw_text,
    category: row.category,
    receivedAt: row.received_at,
  });
}
