import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Send a one-time sign-in link using Supabase Auth's built-in email (no extra
 * email account needed). Implicit flow: the link lands on /auth/callback with
 * the access token in the URL fragment; we verify it server-side and set our
 * own signed session cookie. Supabase must list <app>/auth/callback under
 * Authentication → URL Configuration → Redirect URLs.
 */
export async function sendMagicLink(email: string, kind: "staff" | "teacher", next: string) {
  const env = process.env;
  const url = env["NEXT_PUBLIC_SUPABASE_URL"] || env["SUPABASE_URL"];
  const key =
    env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] || env["SUPABASE_ANON_KEY"] || env["SUPABASE_SERVICE_ROLE_KEY"] || env["SUPABASE_SECRET_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const client = createClient(url, key, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const redirect = new URL("/auth/callback", appUrl);
  redirect.searchParams.set("k", kind);
  redirect.searchParams.set("next", next);

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
  });
  if (error) {
    if (/rate/i.test(error.message)) {
      throw new Error("Too many sign-in emails were sent recently. Please wait a few minutes and try again.");
    }
    throw new Error(error.message);
  }
}
