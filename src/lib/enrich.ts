import { supabaseAdmin } from "./supabase";
import { enrichItem } from "./anthropic";
import { embedOne, toVectorLiteral } from "./embeddings";
import { clusterFeedback } from "./cluster";
import { extractEmail, type Category, type Feedback } from "./types";
import { afterItemClustered } from "./tickets";

/**
 * Async enrich job. Picks up `new` feedback, runs one Anthropic call per item
 * (bug/feature/other + tags + summary + original author) plus an embedding,
 * then clusters it into the nearest theme OF THE SAME CATEGORY (or a new one).
 *
 * Failures are recorded on the row (enrich_error) and the item returns to
 * `new` for retry, so a bad item never blocks the batch.
 */
export async function runEnrichBatch(limit = 10): Promise<{
  processed: number;
  enriched: number;
  failed: number;
}> {
  const db = supabaseAdmin();

  const { data: rows, error } = await db
    .from("feedback")
    .select("*")
    .eq("status", "new")
    .order("received_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`fetch pending feedback failed: ${error.message}`);

  let enriched = 0;
  let failed = 0;

  // Small parallelism: fast enough for a demo, gentle on rate limits.
  const queue = [...((rows ?? []) as Feedback[])];
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const ok = await enrichSafely(row);
      if (ok) enriched += 1;
      else failed += 1;
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  return { processed: rows?.length ?? 0, enriched, failed };
}

/** Enrich one item by id (used right after a form submission). */
export async function enrichById(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("feedback").select("*").eq("id", id).maybeSingle();
  if (!data) return false;
  return enrichSafely(data as Feedback);
}

async function enrichSafely(row: Feedback): Promise<boolean> {
  const db = supabaseAdmin();
  // Claim the row so a concurrent run (button + background) can't double-process it.
  const { data: claimed } = await db
    .from("feedback")
    .update({ status: "processing" })
    .eq("id", row.id)
    .eq("status", "new")
    .select("id");
  if (!claimed || claimed.length === 0) return false;

  try {
    await enrichOne(row);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("feedback")
      .update({ status: "new", enrich_error: message.slice(0, 500) })
      .eq("id", row.id);
    return false;
  }
}

/** Enrich + cluster a single row. */
export async function enrichOne(row: Feedback): Promise<void> {
  const db = supabaseAdmin();

  // 1. Tags + category + summary + original author (one Anthropic call).
  const labels = await enrichItem(row.raw_text, row.user_category);

  // 2. Embedding (separate provider — see lib/embeddings.ts).
  const embedding = await embedOne(`${labels.summary}\n\n${row.raw_text}`.slice(0, 8000));

  // 3. Layered classification: the AI's call becomes the effective category,
  //    flagged when it disagrees with what the submitter picked. The PM
  //    verifies later (review queue).
  const aiCategory: Category = labels.category;
  const aiCorrected = row.user_category != null && row.user_category !== aiCategory;

  const { error: updErr } = await db
    .from("feedback")
    .update({
      segment: row.segment ?? labels.segment,
      feature_area: labels.feature_area,
      type: labels.type,
      severity: labels.severity,
      sentiment: labels.sentiment,
      summary: labels.summary,
      author: labels.author ?? row.author,
      // Forwarded mail: the original author's address, when the AI found one.
      submitter_email: row.submitter_email ?? extractEmail(labels.author),
      embedding: toVectorLiteral(embedding),
      ai_category: aiCategory,
      ai_reason: aiCorrected ? labels.category_reason || null : null,
      ai_corrected: aiCorrected,
      category: aiCategory,
      status: "enriched",
      enriched_at: new Date().toISOString(),
      enrich_error: null,
    })
    .eq("id", row.id);
  if (updErr) throw new Error(`persist enrichment failed: ${updErr.message}`);

  // 4. Cluster into a theme of the same category (moves status → clustered).
  const { themeId } = await clusterFeedback({
    feedbackId: row.id,
    productId: row.product_id,
    embedding,
    summary: labels.summary,
    rawText: row.raw_text,
    category: aiCategory,
    receivedAt: row.received_at,
  });

  // Automation: draft a ticket when a theme crosses the threshold, and count
  // new reports for tickets already filed (FR-93).
  await afterItemClustered(themeId).catch(() => undefined);
}
