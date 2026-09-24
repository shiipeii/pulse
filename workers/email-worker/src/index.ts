import PostalMime from "postal-mime";

/**
 * Pulse Email Worker.
 *
 * Cloudflare Email Routing catch-all → this worker. It parses the MIME message
 * at the edge, derives SPF/DKIM verdicts from Authentication-Results, and POSTs
 * a clean JSON body to Pulse's /api/ingest/email. Pulse resolves the `to`
 * address (<slug>@inbox.<domain>) to a channel, strips quoted history, applies
 * the sender allowlist, and dedups on Message-ID.
 *
 * The worker holds INGEST_MASTER_SECRET (trusted infra) rather than a
 * per-channel token, so new channels need no worker redeploy.
 */
export interface Env {
  PULSE_INGEST_URL: string; // https://app/api/ingest/email
  INGEST_MASTER_SECRET: string;
}

interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  setReject(reason: string): void;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const parsed = await PostalMime.parse(message.raw);

    const messageId =
      parsed.messageId ?? message.headers.get("message-id") ?? `cf-${Date.now()}-${message.to}`;

    const authResults = message.headers.get("authentication-results") ?? "";
    const spf = verdict(authResults, "spf");
    const dkim = verdict(authResults, "dkim");

    const body = {
      messageId,
      from: parsed.from?.address ? formatAddr(parsed.from) : message.from,
      to: message.to.toLowerCase(),
      subject: parsed.subject ?? "",
      text: parsed.text ?? stripHtml(parsed.html ?? ""),
      html: parsed.html ?? undefined,
      spf,
      dkim,
      receivedAt: parsed.date ?? new Date().toISOString(),
    };

    const res = await fetch(env.PULSE_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.INGEST_MASTER_SECRET}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Reject so the sender's MTA retries (and so failures are visible).
      const text = await res.text();
      message.setReject(`Pulse ingest ${res.status}: ${text.slice(0, 200)}`);
    }
  },
};

function formatAddr(a: { name?: string; address?: string }): string {
  return a.name ? `${a.name} <${a.address}>` : (a.address ?? "");
}

/** Pull a mechanism verdict (e.g. "spf=pass") from Authentication-Results. */
function verdict(header: string, mechanism: string): string {
  const m = header.match(new RegExp(`${mechanism}=(\\w+)`, "i"));
  return m ? m[1].toLowerCase() : "none";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
