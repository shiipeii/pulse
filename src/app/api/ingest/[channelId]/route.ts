import { NextRequest, NextResponse } from "next/server";
import { ingest, loadChannel, DecodeError } from "@/lib/ingest";
import { authenticateIngest } from "@/lib/auth";

export const runtime = "nodejs"; // FormSG SDK is Node-only.
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest/[channelId]
 *
 * The front door for hosted-form and webhook (passthrough + FormSG) channels.
 *   1. resolve channel + decoder + mapping_config
 *   2. authenticate (bearer token, or FormSG signature in the decoder)
 *   3. decode → normalise → idempotent insert on source_msg_id
 *   4. the row lands `new`; the enrich worker picks it up async
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string } },
) {
  const rawBody = await req.text();

  let channel;
  try {
    channel = await loadChannel(params.channelId);
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
  if (!channel) {
    return NextResponse.json({ error: "Channel not found or inactive" }, { status: 404 });
  }

  const authError = authenticateIngest(channel, req.headers);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const ingestUrl = absoluteUrl(req);
  try {
    const result = await ingest(channel, rawBody, req.headers, ingestUrl);
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

/** Reconstruct the absolute URL FormSG signed against. */
function absoluteUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return `${proto}://${host}${req.nextUrl.pathname}`;
}
