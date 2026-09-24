import crypto from "crypto";
import type { ChannelType, Decoder, MappingConfig } from "./types";
import { supabaseAdmin } from "./supabase";

/** A random, URL-safe bearer token presented on POST /api/ingest/[channelId]. */
export function generateIngestToken(): string {
  return "pit_" + crypto.randomBytes(24).toString("base64url");
}

/** A short, address-safe slug for an email channel's inbound address. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base || "channel"}-${suffix}`;
}

export interface CreateChannelInput {
  productId: string;
  name: string;
  type: ChannelType;
  /** Optional mapping override; sensible defaults are applied per type. */
  mappingConfig?: MappingConfig;
  /** webhook only: 'passthrough' (default) or 'formsg'. */
  decoder?: Decoder;
  /** email only: restrict to these sender domains, e.g. ["moe.gov.sg"]. */
  senderAllowlist?: string[];
  /** formsg only: storage-mode secret key. */
  formsgSecret?: string;
  /** mailbox only: the shared mailbox address Pulse reads (FR-98). */
  mailboxAddress?: string;
}

export interface CreatedChannelArtifacts {
  id: string;
  name: string;
  type: ChannelType;
  decoder: Decoder;
  ingestToken: string;
  /** The copy-paste artifact the admin needs (form link / webhook URL / email). */
  artifact: {
    kind: "form_link" | "webhook_url" | "email_address" | "mailbox" | "import";
    value: string;
    /** For webhooks: the header the external tool must send. */
    authHeader?: string;
  };
}

/**
 * Create a channel record and return the front-door artifact for the admin to
 * copy. This is the engine behind the add-channel wizard — adding a channel is
 * a config action, not an engineering task.
 */
export async function createChannel(
  input: CreateChannelInput,
): Promise<CreatedChannelArtifacts> {
  const decoder: Decoder =
    input.type === "form"
      ? "passthrough"
      : input.type === "email"
        ? "email"
        : input.type === "mailbox"
          ? "mailbox"
          : input.type === "import"
            ? "import"
            : (input.decoder ?? "passthrough");

  const ingestToken = generateIngestToken();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let inboundAddress: string | null = null;
  if (input.type === "email") {
    const domain = process.env.INBOUND_EMAIL_DOMAIN ?? "inbox.pulse.example.gov.sg";
    inboundAddress = `${slugify(input.name)}@${domain}`;
  }
  if (input.type === "mailbox") {
    const addr = (input.mailboxAddress ?? "").trim().toLowerCase();
    if (!addr.includes("@")) throw new Error("Enter the shared mailbox address.");
    inboundAddress = addr;
  }

  const mappingConfig = input.mappingConfig ?? defaultMapping(input.type, decoder);

  const { data, error } = await supabaseAdmin()
    .from("channels")
    .insert({
      product_id: input.productId,
      name: input.name,
      type: input.type,
      decoder,
      mapping_config: mappingConfig,
      ingest_token: ingestToken,
      inbound_address: inboundAddress,
      sender_allowlist: input.senderAllowlist ?? [],
      formsg_secret: input.formsgSecret ?? null,
    })
    .select("id, name, type, decoder")
    .single();

  if (error) throw new Error(`Failed to create channel: ${error.message}`);

  // Every channel is also a row in the source register (FR-90).
  const kind =
    input.type === "form" ? "form" : input.type === "mailbox" ? "mailbox" : input.type === "email" ? "email" : decoder === "formsg" ? "formsg" : input.type === "import" ? "other" : "other";
  await supabaseAdmin()
    .from("sources")
    .upsert(
      {
        product_id: input.productId,
        name: input.name,
        kind,
        channel_id: data.id,
        status: input.type === "import" ? "imported" : "connected",
      },
      { onConflict: "channel_id", ignoreDuplicates: true },
    );

  const ingestUrl = `${appUrl}/api/ingest/${data.id}`;
  let artifact: CreatedChannelArtifacts["artifact"];
  switch (input.type) {
    case "form":
      artifact = { kind: "form_link", value: `${appUrl}/f/${data.id}` };
      break;
    case "email":
      artifact = { kind: "email_address", value: inboundAddress! };
      break;
    case "mailbox":
      artifact = { kind: "mailbox", value: inboundAddress! };
      break;
    case "import":
      artifact = { kind: "import", value: `${appUrl}/import` };
      break;
    case "webhook":
    default:
      artifact = {
        kind: "webhook_url",
        value: ingestUrl,
        authHeader: `Authorization: Bearer ${ingestToken}`,
      };
      break;
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    decoder: data.decoder,
    ingestToken,
    artifact,
  };
}

function defaultMapping(type: ChannelType, decoder: Decoder): MappingConfig {
  if (type === "form") {
    // The hosted form posts { message, email, segment, category, nonce }.
    return {
      text: "message",
      author: "email",
      segment: "segment",
      category: "category",
      sourceMsgId: "nonce",
    };
  }
  if (decoder === "formsg") {
    // FormSG decoder builds default text from responses; no mapping needed.
    return {};
  }
  // Generic webhook (Tally/Typeform/Jotform) — admin tunes this in the wizard.
  return {};
}
