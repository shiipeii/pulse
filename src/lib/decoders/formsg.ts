import type { Channel, NormalisedFeedback } from "../types";
import { applyMapping } from "../mapping";
import { DecodeError } from "./passthrough";

/**
 * formsg decoder — FormSG is the gov-default for schools. Storage-mode
 * submissions are end-to-end encrypted: we must verify the X-FormSG-Signature
 * and decrypt with the form's secret key via @opengovsg/formsg-sdk before we
 * can read any fields.
 *
 * Idempotency: FormSG retries and can deliver duplicates / out of order, so we
 * dedup on the submission id (the ingest unique constraint does the rest).
 *
 * The SDK is pinned (see package.json) to avoid breaking-change risk on
 * auto-upgrade — see PRD §11 risk #2.
 */
export async function decodeFormSG(
  channel: Channel,
  rawBody: string,
  headers: Headers,
  ingestUrl: string,
): Promise<NormalisedFeedback> {
  if (!channel.formsg_secret) {
    throw new DecodeError(500, "FormSG channel is missing its storage-mode secret key");
  }

  const signature = headers.get("x-formsg-signature");
  if (!signature) {
    throw new DecodeError(401, "Missing X-FormSG-Signature header");
  }

  // Lazy import: Node-only dependency, kept out of the edge/client bundle.
  const { default: formsgSdk } = await import("@opengovsg/formsg-sdk");
  const sdk = formsgSdk({ mode: "production" });

  let body: { data?: { submissionId?: string; encryptedContent?: string; attachmentDownloadUrls?: unknown } };
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new DecodeError(400, "Body is not valid JSON");
  }

  // 1. Verify the webhook signature against the exact ingest URL.
  try {
    sdk.webhooks.authenticate(signature, ingestUrl);
  } catch {
    throw new DecodeError(401, "Invalid X-FormSG-Signature");
  }

  // 2. Decrypt the storage-mode payload.
  const decrypted = sdk.crypto.decrypt(channel.formsg_secret, body.data as never);
  if (!decrypted) {
    throw new DecodeError(422, "FormSG decryption failed (bad key or payload)");
  }

  const submissionId = body.data?.submissionId;
  if (!submissionId) {
    throw new DecodeError(422, "FormSG payload missing submissionId");
  }

  // decrypted.responses is an array of { question, answer, ... }.
  const responses = (decrypted as { responses: { question: string; answer?: string }[] }).responses ?? [];
  const payload: Record<string, unknown> = {
    submissionId,
    responses,
  };

  // Default: concatenate "Question: answer" lines unless mapping overrides.
  const defaultText = responses
    .map((r) => `${r.question}: ${r.answer ?? ""}`.trim())
    .filter(Boolean)
    .join("\n");

  // Auto-detect a "Bug or feature?" question so FormSG forms work without mapping.
  const typeAnswer = responses.find(
    (r) => /bug|feature|type of feedback/i.test(r.question) && /bug|feature|suggest/i.test(r.answer ?? ""),
  )?.answer;

  const mapped = applyMapping(payload, channel.mapping_config, {
    text: defaultText,
    sourceMsgId: submissionId,
    category: (typeAnswer as never) ?? null,
  });

  if (!mapped.text) {
    throw new DecodeError(422, "FormSG submission produced no feedback text");
  }

  return {
    sourceMsgId: submissionId,
    text: mapped.text,
    author: mapped.author,
    segment: mapped.segment,
    category: mapped.category,
    rawPayload: payload,
  };
}
