import { NextRequest, NextResponse } from "next/server";
import { ingest, loadChannelByAddress, DecodeError } from "@/lib/ingest";
import { authenticateIngest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest/email
 *
 * Convenience door for the Cloudflare Email Worker: it posts the parsed email
 * (including the `to` address) plus the shared INGEST_MASTER_SECRET. We resolve
 * <slug>@inbox.<domain> → channel, then funnel into the same ingest hallway as
 * everything else. Keeps the worker stateless (no channelId lookup round-trip).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  let body: { to?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
  }
  if (!body.to) {
    return NextResponse.json({ error: "Missing 'to' address" }, { status: 422 });
  }

  let channel;
  try {
    channel = await loadChannelByAddress(body.to);
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
  if (!channel) {
    return NextResponse.json(
      { error: `No active email channel for ${body.to}` },
      { status: 404 },
    );
  }

  const authError = authenticateIngest(channel, req.headers);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const result = await ingest(channel, rawBody, req.headers, req.url);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof DecodeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
