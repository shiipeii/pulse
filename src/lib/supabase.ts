import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 *
 * This bypasses RLS, so it is the trusted writer used by ingest + enrich. Every
 * query made through it MUST still filter by product_id explicitly (defence in
 * depth) — see the helpers below. Never import this into client components.
 */
let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const env = process.env;
  const url = env["NEXT_PUBLIC_SUPABASE_URL"] || env["SUPABASE_URL"];
  const key = env["SUPABASE_SERVICE_ROLE_KEY"] || env["SUPABASE_SECRET_KEY"];
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

/**
 * Read-only client for dashboard server components. Uses the service role for
 * v1 (no end-user auth yet — PRD open question §13) but callers always pass an
 * explicit product_id, so reads stay tenant-scoped. When auth lands, swap this
 * for an anon/authenticated client whose JWT carries the product_id claim and
 * the RLS policies in 0003_rls.sql take over with no app changes.
 */
export function supabaseRead(): SupabaseClient {
  return supabaseAdmin();
}
