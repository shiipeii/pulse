/**
 * Local alternative to the "Load demo data" button: loads the sample
 * feedback, then classifies and clusters it all.
 *
 *   npm run seed:demo      (reads .env.local)
 */
import { supabaseAdmin } from "../src/lib/supabase";
import { loadDemoData, SAMPLES } from "../src/lib/demo";
import { runEnrichBatch } from "../src/lib/enrich";

async function main() {
  const { channelId, added } = await loadDemoData();
  console.log(`Submitted ${added} new sample items (${SAMPLES.length - added} already there).`);

  console.log("Classifying and clustering with Claude — this takes a minute or two…");
  for (let round = 0; round < 15; round++) {
    const r = await runEnrichBatch(10);
    if (r.processed === 0) break;
    console.log(`  batch: ${r.enriched} done, ${r.failed} failed`);
    if (r.enriched === 0 && r.failed > 0) {
      const { data: errs } = await supabaseAdmin()
        .from("feedback")
        .select("enrich_error")
        .not("enrich_error", "is", null)
        .limit(1);
      throw new Error(`Enrich is failing: ${errs?.[0]?.enrich_error ?? "unknown error"}`);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log(`\nDone. Feedback form for your demo: ${appUrl}/f/${channelId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
