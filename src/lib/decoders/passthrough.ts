import crypto from "crypto";
import type { Channel, NormalisedFeedback } from "../types";
import { applyMapping } from "../mapping";

/**
 * passthrough decoder — for the hosted form and native webhooks (Tally /
 * Typeform / Jotform). The body is already JSON; mapping_config tells us which
 * fields are the feedback text / author / source id.
 *
 * If no sourceMsgId is mapped or present, we hash the payload so retries of the
 * exact same submission dedup, while genuinely new submissions don't collide.
 */
export async function decodePassthrough(
  channel: Channel,
  rawBody: string,
): Promise<NormalisedFeedback> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new DecodeError(400, "Body is not valid JSON");
  }

  const mapped = applyMapping(payload, channel.mapping_config);

  if (!mapped.text) {
    throw new DecodeError(
      422,
      "Could not extract feedback text — check the channel's mapping_config.text",
    );
  }

  const sourceMsgId =
    mapped.sourceMsgId ??
    crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 32);

  return {
    sourceMsgId,
    text: mapped.text,
    author: mapped.author,
    segment: mapped.segment,
    category: mapped.category,
    rawPayload: payload,
  };
}

export class DecodeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "DecodeError";
  }
}
