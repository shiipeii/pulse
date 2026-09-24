import { NextRequest, NextResponse } from "next/server";
import { getProduct } from "@/lib/product";
import { supabaseRead } from "@/lib/supabase";
import { embedOne, toVectorLiteral } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=attendance+flow+complaints&product=tw
 *
 * Semantic search over the archive — turns "do we already know this?" into a
 * query, not a meeting. Embeds the query and ranks feedback by cosine
 * similarity via the tenant-scoped search_feedback RPC.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Missing query ?q=" }, { status: 422 });

  const product = await getProduct(req.nextUrl.searchParams.get("product") ?? undefined);
  if (!product) return NextResponse.json({ error: "No product" }, { status: 404 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  try {
    const embedding = await embedOne(q);
    const { data, error } = await supabaseRead().rpc("search_feedback", {
      p_product_id: product.id,
      p_embedding: toVectorLiteral(embedding),
      p_limit: limit,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ query: q, results: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
