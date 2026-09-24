import type { MappingConfig, NormalisedFeedback, UserCategory } from "./types";

/** Resolve a dot-path (supporting numeric array indices) into an object. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function asString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

/**
 * Apply a channel's mapping_config to an already-decoded payload, producing the
 * normalised feedback shape. Decoders that already know how to read their own
 * source (FormSG, email) pass a base; mapping_config can still override fields.
 */
export function applyMapping(
  payload: Record<string, unknown>,
  mapping: MappingConfig,
  base?: Partial<NormalisedFeedback>,
): {
  text: string;
  author?: string | null;
  segment?: string | null;
  sourceMsgId?: string;
  category?: UserCategory | null;
} {
  let text = base?.text ?? "";

  if (mapping.text) {
    text = asString(getPath(payload, mapping.text)) ?? text;
  } else if (mapping.textFields?.length) {
    const parts = mapping.textFields
      .map((p) => asString(getPath(payload, p)))
      .filter((s): s is string => Boolean(s && s.trim()));
    if (parts.length) text = parts.join("\n");
  }

  const author =
    (mapping.author ? asString(getPath(payload, mapping.author)) : undefined) ??
    base?.author ??
    null;

  const segment =
    (mapping.segment ? asString(getPath(payload, mapping.segment)) : undefined) ??
    base?.segment ??
    null;

  const sourceMsgId = mapping.sourceMsgId
    ? asString(getPath(payload, mapping.sourceMsgId))
    : base?.sourceMsgId;

  const rawCategory = (
    (mapping.category ? asString(getPath(payload, mapping.category)) : undefined) ??
    base?.category ??
    ""
  )
    .toString()
    .toLowerCase();
  // Accept common spellings from third-party forms ("Bug report", "Feature request").
  const category: UserCategory | null = rawCategory.includes("bug")
    ? "bug"
    : rawCategory.includes("feature") || rawCategory.includes("suggest")
      ? "feature"
      : null;

  return { text: text.trim(), author, segment, sourceMsgId, category };
}
