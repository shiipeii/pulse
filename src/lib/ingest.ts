import { supabaseAdmin } from "./supabase";
import { decode, DecodeError } from "./decoders";
import { extractEmail, type Channel, type NormalisedFeedback } from "./types";

export { DecodeError };

/** Load an active channel by id (service role; trusted path). */
export async function loadChannel(channelId: string): Promise<Channel | null> {
  const { data, error } = await supabaseAdmin()
    .from("channels")
    .select("*")
    .eq("id", channelId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`loadChannel failed: ${error.message}`);
  return (data as Channel) ?? null;
}

/** Load an active email channel by its generated inbound address. */
export async function loadChannelByAddress(address: string): Promise<Channel | null> {
  const { data, error } = await supabaseAdmin()
    .from("channels")
    .select("*")
    .eq("inbound_address", address.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`loadChannelByAddress failed: ${error.message}`);
  return (data as Channel) ?? null;
}

export interface IngestResult {
  ok: true;
  id: string;
  duplicate: boolean;
}

/**
 * The single internal ingest function — the hallway. Decode the raw body via
 * the channel's decoder, normalise, and insert idempotently on
 * (channel_id, source_msg_id). A duplicate is a no-op success (FormSG/email
 * retries are safe). The row lands `new`; the enrich worker picks it up.
 */
export async function ingest(
  channel: Channel,
  rawBody: string,
  headers: Headers,
  ingestUrl: string,
): Promise<IngestResult> {
  const normalised = await decode(channel, rawBody, headers, ingestUrl);
  return insertNormalised(channel, normalised);
}

/**
 * Insert an already-normalised item (used by ingest, imports and the mailbox
 * connector). Two duplicate guards: per channel (source message id) and across
 * channels (dedupe key, e.g. an email's Message-ID — FR-100).
 */
export async function insertNormalised(channel: Channel, normalised: NormalisedFeedback): Promise<IngestResult> {
  const db = supabaseAdmin();

  if (normalised.dedupeKey) {
    const { data: dup } = await db
      .from("feedback")
      .select("id")
      .eq("product_id", channel.product_id)
      .eq("dedupe_key", normalised.dedupeKey)
      .maybeSingle();
    if (dup) return { ok: true, id: dup.id, duplicate: true };
  }

  // A forwarded email's sender is the forwarder, not the teacher — leave the
  // submitter blank there; enrich fills it from the original author if found.
  const submitter =
    normalised.submitterEmail !== undefined
      ? normalised.submitterEmail
      : channel.type === "email"
        ? null
        : extractEmail(normalised.author);

  const { data, error } = await db
    .from("feedback")
    .upsert(
      {
        product_id: channel.product_id,
        channel_id: channel.id,
        source_msg_id: normalised.sourceMsgId,
        raw_text: normalised.text,
        raw_payload: normalised.rawPayload,
        author: normalised.author ?? null,
        segment: normalised.segment ?? null,
        user_category: normalised.category ?? null,
        submitter_email: submitter ? submitter.toLowerCase() : null,
        dedupe_key: normalised.dedupeKey ?? null,
        received_at: normalised.receivedAt ?? new Date().toISOString(),
        status: "new",
      },
      { onConflict: "channel_id,source_msg_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    if (error.code === "23505" && normalised.dedupeKey) {
      const { data: dup } = await db
        .from("feedback")
        .select("id")
        .eq("product_id", channel.product_id)
        .eq("dedupe_key", normalised.dedupeKey)
        .maybeSingle();
      return { ok: true, id: dup?.id ?? "", duplicate: true };
    }
    throw new Error(`feedback insert failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    const { data: existing } = await db
      .from("feedback")
      .select("id")
      .eq("channel_id", channel.id)
      .eq("source_msg_id", normalised.sourceMsgId)
      .maybeSingle();
    return { ok: true, id: existing?.id ?? "", duplicate: true };
  }

  return { ok: true, id: data[0].id, duplicate: false };
}
