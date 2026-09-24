import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runEnrichBatch } from "@/lib/enrich";
import { pollMailboxes, mailboxConfigured } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Every few minutes (GitHub Actions schedule, see .github/workflows/pulse-schedule.yml):
 * read the shared mailbox, then classify anything waiting.
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mailbox = mailboxConfigured() ? await pollMailboxes().catch((e) => ({ error: String(e) })) : "not configured";
  const started = Date.now();
  let enriched = 0;
  // Drain for up to ~4 minutes.
  while (Date.now() - started < 240_000) {
    const r = await runEnrichBatch(15);
    enriched += r.enriched;
    if (r.processed === 0 || r.enriched === 0) break;
  }
  return NextResponse.json({ mailbox, enriched });
}

export const GET = run;
export const POST = run;
