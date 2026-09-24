import { NextRequest, NextResponse } from "next/server";
import { runEnrichBatch } from "@/lib/enrich";
import { bearer } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Enrichment can take a while per item; give the batch room.
export const maxDuration = 300;

/**
 * POST /api/enrich  (cron / manual worker trigger)
 *
 * Drains a batch of `new` feedback through enrich + cluster. Protect with
 * ENRICH_WORKER_SECRET (Bearer). Point a Vercel Cron / scheduler at this every
 * synthesis cycle (e.g. every few minutes), or call it by hand from the
 * dashboard's "Run enrich" button.
 *
 *   POST /api/enrich?limit=25
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ENRICH_WORKER_SECRET;
  if (secret && bearer(req.headers) !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "25"), 100);
  try {
    const result = await runEnrichBatch(limit);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
