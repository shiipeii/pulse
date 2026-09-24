import type { Channel, NormalisedFeedback } from "../types";
import { decodePassthrough, DecodeError } from "./passthrough";
import { decodeFormSG } from "./formsg";
import { decodeEmail } from "./email";

export { DecodeError };

/**
 * The one decode step in the hallway. Resolves the channel's decoder and turns
 * the raw request into a normalised feedback row. Adding a NEW source type means
 * adding one decoder here — nothing else in the pipeline changes.
 */
export async function decode(
  channel: Channel,
  rawBody: string,
  headers: Headers,
  ingestUrl: string,
): Promise<NormalisedFeedback> {
  switch (channel.decoder) {
    case "passthrough":
      return decodePassthrough(channel, rawBody);
    case "formsg":
      return decodeFormSG(channel, rawBody, headers, ingestUrl);
    case "email":
      return decodeEmail(channel, rawBody);
    default:
      throw new DecodeError(500, `Unknown decoder '${channel.decoder}'`);
  }
}
