import { supabaseRead } from "./supabase";
import type { Product } from "./types";

/**
 * Resolve the active tenant. v1 is single-tenant (TW); we resolve by slug
 * (default 'tw') or fall back to the first product. When end-user auth lands,
 * this becomes "the product on the session's JWT claim" with no schema change.
 */
export async function getProduct(slug?: string): Promise<Product | null> {
  const db = supabaseRead();
  if (slug) {
    const { data } = await db.from("products").select("*").eq("slug", slug).maybeSingle();
    return (data as Product) ?? null;
  }
  const { data } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Product) ?? null;
}
