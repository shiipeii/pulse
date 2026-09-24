import { supabaseAdmin } from "./supabase";
import { insertNormalised } from "./ingest";
import { messageIdKey } from "./decoders/email";
import { extractEmail, type Channel } from "./types";

/**
 * Shared feedback mailbox connector (FR-98, FR-99) — Microsoft 365 / Outlook
 * via Microsoft Graph, app-only access. IT registers an app with
 * Mail.Read (application) and restricts it to ONE mailbox with an
 * Application Access Policy, so Pulse can't read any other mailbox.
 *
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
 *
 * Each mailbox channel keeps a cursor (last received time) in channels.state.
 */
export function mailboxConfigured(): boolean {
  return Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

async function graphToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    client_secret: process.env.MS_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  uniqueBody?: { content?: string };
  body?: { content?: string };
}

function domainAllowed(email: string | null, allow: string[]): boolean {
  if (allow.length === 0) return true;
  const d = email?.split("@")[1] ?? "";
  return allow.some((a) => {
    const x = a.toLowerCase().replace(/^@/, "");
    return d === x || d.endsWith(`.${x}`);
  });
}

export async function pollMailboxes(): Promise<{ channels: number; added: number; errors: string[] }> {
  if (!mailboxConfigured()) return { channels: 0, added: 0, errors: ["Mailbox connector not configured"] };
  const db = supabaseAdmin();
  const { data: channels } = await db.from("channels").select("*").eq("type", "mailbox").eq("is_active", true);
  if (!channels || channels.length === 0) return { channels: 0, added: 0, errors: [] };

  const token = await graphToken();
  let added = 0;
  const errors: string[] = [];

  for (const ch of channels as Channel[]) {
    try {
      const since =
        (ch.state?.lastReceived as string | undefined) ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
      const url =
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ch.inbound_address ?? "")}/mailFolders/inbox/messages` +
        `?$filter=receivedDateTime gt ${since}&$orderby=receivedDateTime asc&$top=50` +
        `&$select=id,internetMessageId,subject,from,receivedDateTime,uniqueBody,body`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
      });
      if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const msgs = ((await res.json()) as { value: GraphMessage[] }).value ?? [];

      let last = since;
      for (const m of msgs) {
        last = m.receivedDateTime > last ? m.receivedDateTime : last;
        const fromAddr = m.from?.emailAddress?.address?.toLowerCase() ?? null;
        if (!domainAllowed(fromAddr, ch.sender_allowlist ?? [])) continue;
        const bodyText = (m.uniqueBody?.content || m.body?.content || "").trim();
        const text = [m.subject ? `Subject: ${m.subject}` : null, bodyText].filter(Boolean).join("\n\n").trim();
        if (!text) continue;
        const msgId = m.internetMessageId || m.id;
        const r = await insertNormalised(ch, {
          sourceMsgId: msgId,
          dedupeKey: messageIdKey(msgId),
          text: text.slice(0, 20000),
          author: m.from?.emailAddress?.name ? `${m.from.emailAddress.name} <${fromAddr}>` : fromAddr,
          submitterEmail: extractEmail(fromAddr),
          receivedAt: m.receivedDateTime,
          rawPayload: { graphId: m.id, subject: m.subject, from: fromAddr },
        });
        if (!r.duplicate) added += 1;
      }
      await db
        .from("channels")
        .update({ state: { ...(ch.state ?? {}), lastReceived: last, lastPolledAt: new Date().toISOString() } })
        .eq("id", ch.id);
    } catch (e) {
      errors.push(`${ch.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { channels: channels.length, added, errors };
}
