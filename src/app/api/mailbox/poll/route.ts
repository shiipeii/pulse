import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { pollMailboxes } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Read new mail from shared mailbox channels (FR-98). */
async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await pollMailboxes());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
