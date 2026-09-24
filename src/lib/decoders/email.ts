import EmailReplyParser from "email-reply-parser";
import type { Channel, NormalisedFeedback } from "../types";
import { DecodeError } from "./passthrough";

/**
 * Shape the Cloudflare Email Worker POSTs to ingest. The worker does the MIME
 * parsing at the edge and hands us clean fields + auth verdicts.
 */
export interface EmailIngestBody {
  messageId: string;
  from: string; // "Name <addr@domain>" or "addr@domain"
  to?: string;
  subject?: string;
  text: string; // text/plain body (full, including quoted history)
  html?: string;
  spf?: "pass" | "fail" | "neutral" | "softfail" | "none" | string;
  dkim?: "pass" | "fail" | "neutral" | "none" | string;
  receivedAt?: string;
}

/**
 * email decoder — forwarded mail buries the real author in the quoted block.
 * We:
 *   1. enforce the per-channel sender-domain allowlist + SPF/DKIM verdicts,
 *   2. strip quoted history + signature footers (email-reply-parser),
 *   3. dedup on Message-ID (the ingest unique constraint),
 * then leave ORIGINAL-author extraction to the enrich LLM rather than building
 * a brittle header parser (PRD §7, email-forward specifics).
 */
export async function decodeEmail(
  channel: Channel,
  rawBody: string,
): Promise<NormalisedFeedback> {
  let body: EmailIngestBody;
  try {
    body = JSON.parse(rawBody) as EmailIngestBody;
  } catch {
    throw new DecodeError(400, "Body is not valid JSON");
  }

  if (!body.messageId) throw new DecodeError(422, "Missing Message-ID");
  if (!body.from) throw new DecodeError(422, "Missing From");

  // 1a. Sender-domain allowlist (empty = allow all).
  const senderDomain = extractDomain(body.from);
  const allow = channel.sender_allowlist ?? [];
  if (allow.length > 0) {
    const ok = senderDomain && allow.some((d) => domainMatches(senderDomain, d));
    if (!ok) {
      throw new DecodeError(403, `Sender domain '${senderDomain}' not in channel allowlist`);
    }
  }

  // 1b. SPF/DKIM verdict (reject hard auth failures when verdicts are present).
  if (body.spf === "fail" || body.dkim === "fail") {
    throw new DecodeError(403, "SPF/DKIM verdict failed");
  }

  // 2. Strip quoted history + signature — keep the visible (original) message.
  const visible = stripQuoted(body.text);
  const subject = body.subject?.trim();
  const text = [subject ? `Subject: ${subject}` : null, visible]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!text) throw new DecodeError(422, "Email produced no feedback text after stripping");

  return {
    sourceMsgId: body.messageId,
    // Same email via the shared mailbox and a forward is stored once (FR-100).
    dedupeKey: messageIdKey(body.messageId),
    // Forwarder's address as a fallback; the enrich LLM overrides with the
    // original author when it can extract one from the body.
    author: body.from,
    receivedAt: body.receivedAt,
    text,
    rawPayload: { ...body, _strippedText: visible },
  };
}

function stripQuoted(raw: string): string {
  try {
    const parsed = new EmailReplyParser().read(raw);
    const visible = parsed
      .getFragments()
      .filter((f) => !f.isHidden() && !f.isQuoted() && !f.isSignature())
      .map((f) => f.getContent())
      .join("\n")
      .trim();
    return visible || raw.trim();
  } catch {
    return raw.trim();
  }
}

function extractDomain(from: string): string | null {
  const m = from.match(/[<\s]?([^<>\s@]+)@([^<>\s]+?)[>\s]?$/);
  return m ? m[2].toLowerCase() : null;
}

/** "subdomain.moe.gov.sg" matches an allowlist entry of "moe.gov.sg". */
function domainMatches(domain: string, allowed: string): boolean {
  const a = allowed.toLowerCase().replace(/^@/, "");
  return domain === a || domain.endsWith(`.${a}`);
}

/** Normalise a Message-ID into a cross-channel duplicate key. */
export function messageIdKey(messageId: string): string {
  return `msgid:${messageId.trim().replace(/^<|>$/g, "").toLowerCase()}`;
}
