/**
 * Pluggable embeddings.
 *
 * Anthropic has no embeddings endpoint, so the vector half of enrichment goes
 * through a separate provider. Configured via env:
 *
 *   EMBEDDING_PROVIDER = "openai" (default, OpenAI-compatible) | "voyage"
 *   EMBEDDING_DIM      = must match the vector(N) column in the migrations
 *
 * The OpenAI-compatible path works against OpenAI, a self-hosted gateway, or
 * any compatible endpoint (set OPENAI_BASE_URL). Voyage is Anthropic's
 * commonly-recommended embedding partner.
 */

export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? "1536");

type Provider = "openai" | "voyage";

function provider(): Provider {
  return (process.env.EMBEDDING_PROVIDER as Provider) ?? "openai";
}

/** Embed a batch of texts. Returns one vector per input, order-preserved. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  switch (provider()) {
    case "voyage":
      return embedVoyage(texts);
    case "openai":
    default:
      return embedOpenAI(texts);
  }
}

/** Embed a single text. */
export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embed([text]);
  return v;
}

async function embedOpenAI(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is unset");
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

async function embedVoyage(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("EMBEDDING_PROVIDER=voyage but VOYAGE_API_KEY is unset");
  const model = process.env.VOYAGE_EMBEDDING_MODEL ?? "voyage-3.5";

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts, input_type: "document" }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

/** pgvector accepts a bracketed string literal: "[0.1,0.2,...]". */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
