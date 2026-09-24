import type { Channel } from "./types";

/** Extract a Bearer token from the Authorization header (or null). */
export function bearer(headers: Headers): string | null {
  const h = headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Authenticate an ingest request against a channel.
 *
 *   • formsg   → no bearer; the decoder verifies X-FormSG-Signature instead.
 *   • form     → the hosted form posts the channel's ingest_token.
 *   • webhook  → the external tool posts the channel's ingest_token.
 *   • email    → the Cloudflare worker posts the shared INGEST_MASTER_SECRET
 *                (it can't hold a per-channel token), or the channel token.
 *
 * Returns null on success, or a human-readable reason on failure.
 */
export function authenticateIngest(channel: Channel, headers: Headers): string | null {
  if (channel.decoder === "formsg") return null; // signature-based; checked in decoder

  const token = bearer(headers);
  if (!token) return "Missing Authorization: Bearer <token>";

  const master = process.env.INGEST_MASTER_SECRET;
  const tokenOk = token === channel.ingest_token;
  const masterOk = channel.type === "email" && master ? token === master : false;

  if (!tokenOk && !masterOk) return "Invalid ingest token";
  return null;
}
