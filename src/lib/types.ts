// Shared domain types for Pulse. Mirrors the SQL schema in supabase/migrations.

export type ChannelType = "form" | "webhook" | "email" | "import" | "mailbox";
export type Decoder = "passthrough" | "formsg" | "email" | "import" | "mailbox";

export type FeedbackStatus =
  | "new"
  | "processing"
  | "enriched"
  | "clustered"
  | "routed"
  | "closed";

export type FeedbackType =
  | "bug"
  | "feature_request"
  | "praise"
  | "question"
  | "complaint"
  | "other";

/** Bug vs feature split. The form offers bug | feature; the AI may also say "other". */
export type Category = "bug" | "feature" | "other";
export type UserCategory = "bug" | "feature";
export type ReviewStatus = "pending" | "verified";
/**
 * Theme lifecycle.
 *   bugs:     open → being_fixed → fixed
 *   features: open → planned (internal) → released   | not_now (internal)
 *   other:    open | not_now
 * "planned" and "not_now" are never shown to teachers (FR-46).
 */
export type ThemeStatus = "open" | "being_fixed" | "fixed" | "planned" | "not_now" | "released";
export type StaffRole = "admin" | "pm" | "engineer" | "stakeholder";

export type Severity = "low" | "medium" | "high" | "critical";
export type Sentiment = "positive" | "neutral" | "negative";

export interface Product {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

/**
 * mapping_config tells a decoder how to read this source's payload into the
 * normalised feedback shape. Keys are dot-paths into the decoded JSON object;
 * e.g. for a Tally webhook: { text: "data.fields.0.value", author: "data.email" }.
 * Any field left unset falls back to a decoder default / the enrich LLM.
 */
export interface MappingConfig {
  /** Path to the main feedback text (required-ish; decoder may concatenate). */
  text?: string;
  /** Paths to concatenate into the feedback text (alternative to `text`). */
  textFields?: string[];
  /** Path to the original author (email / name). */
  author?: string;
  /** Path to a stable source message id for dedup. */
  sourceMsgId?: string;
  /** Path to a segment hint (e.g. school level), if the form captures one. */
  segment?: string;
  /** Path to the submitter's own bug/feature choice, if the source captures one. */
  category?: string;
}

export interface Channel {
  id: string;
  product_id: string;
  name: string;
  type: ChannelType;
  decoder: Decoder;
  mapping_config: MappingConfig;
  ingest_token: string;
  inbound_address: string | null;
  sender_allowlist: string[];
  formsg_secret: string | null;
  is_active: boolean;
  state?: Record<string, unknown>;
  created_at: string;
}

export interface Feedback {
  id: string;
  product_id: string;
  channel_id: string;
  source_msg_id: string;
  raw_text: string;
  raw_payload: Record<string, unknown>;
  author: string | null;
  received_at: string;
  status: FeedbackStatus;
  segment: string | null;
  feature_area: string | null;
  type: FeedbackType | null;
  severity: Severity | null;
  sentiment: Sentiment | null;
  summary: string | null;
  theme_id: string | null;
  enrich_error: string | null;
  enriched_at: string | null;
  // bug / feature classification + PM verification
  category: Category | null;
  user_category: UserCategory | null;
  ai_category: Category | null;
  ai_reason: string | null;
  ai_corrected: boolean;
  review_status: ReviewStatus;
  verified_by: string | null;
  verified_at: string | null;
  submitter_email: string | null;
  dedupe_key: string | null;
}

export interface Theme {
  id: string;
  product_id: string;
  label: string;
  summary: string | null;
  frequency: number;
  severity_score: number;
  sentiment: Sentiment | null;
  category: Category;
  status: ThemeStatus;
  fixed_at: string | null;
  regressed: boolean;
  released_at: string | null;
  decided_at: string | null;
  owner: string | null;
  suggestion: string | null;
  suggestion_at: string | null;
  created_at: string;
  updated_at: string;
  // Prioritisation layer (migration 0006). Optional: absent until it has run.
  effort?: "s" | "m" | "l" | "xl" | null;
  effort_source?: "ai" | "engineer" | "pm" | null;
  effort_set_by?: string | null;
  decision?: "now" | "next" | "later" | "not_now" | null;
  decided_by?: string | null;
  impact?: number | null;
  urgent?: boolean;
  urgent_reason?: string | null;
  urgent_since?: string | null;
  urgent_cleared_at?: string | null;
  area?: string | null;
  fits_goals?: boolean;
  scored_at?: string | null;
}

/** Normalised output of a decoder — the canonical shape ingest inserts. */
export interface NormalisedFeedback {
  sourceMsgId: string;
  text: string;
  author?: string | null;
  segment?: string | null;
  /** The submitter's own bug/feature pick, if the source captured one. */
  category?: UserCategory | null;
  /** The submitter's email, when known (form, direct mail, signed-in teacher). */
  submitterEmail?: string | null;
  /** Cross-channel duplicate key, e.g. "msgid:<Message-ID>" (FR-100). */
  dedupeKey?: string | null;
  receivedAt?: string;
  rawPayload: Record<string, unknown>;
}

/** The enrichment labels produced by the Anthropic call. */
export interface EnrichmentLabels {
  segment: string;
  feature_area: string;
  type: FeedbackType;
  severity: Severity;
  sentiment: Sentiment;
  summary: string;
  /** bug | feature | other — the AI's independent call. */
  category: Category;
  /** Why the AI disagreed with the submitter (empty when it agrees). */
  category_reason: string;
  /** Original author, if the model can extract one (esp. forwarded email). */
  author?: string | null;
}

export interface ThemeStats {
  theme_id: string;
  product_id: string;
  items: number;
  reporters: number;
  channels: number;
  last7: number;
  prev7: number;
  any_verified: boolean;
  last_received: string | null;
}

/** Pull a plain address out of "Name <a@b.c>" or "a@b.c"; null if none. */
export function extractEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}
