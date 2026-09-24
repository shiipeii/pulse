/**
 * Local enrich runner: drains the `new` feedback queue until empty.
 *
 *   node --env-file=.env --import tsx scripts/run-enrich.ts
 *   (or: npm run enrich, with env already loaded)
 *
 * In production the same job runs on a schedule via POST /api/enrich.
 */
import { runEnrichBatch } from "../src/lib/enrich";

async function main() {
  let total = { enriched: 0, failed: 0 };
  for (;;) {
    const r = await runEnrichBatch(10);
    total.enriched += r.enriched;
    total.failed += r.failed;
    console.log(
      `batch: processed=${r.processed} enriched=${r.enriched} failed=${r.failed}`,
    );
    if (r.processed === 0) break;
  }
  console.log(`done: enriched=${total.enriched} failed=${total.failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
