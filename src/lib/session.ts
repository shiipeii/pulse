/**
 * Signed session cookies (edge-safe: Web Crypto only, so middleware can verify).
 *
 * One cookie holds who is signed in:
 *   kind "staff"   — PM / engineer / stakeholder / admin (dashboard)
 *   kind "teacher" — a teacher viewing "Your feedback"
 * The payload is HMAC-signed with SESSION_SECRET, so it can't be forged.
 */
import type { StaffRole } from "./types";

export const SESSION_COOKIE = "pulse_session";
export const SESSION_DAYS = 14;

export interface Session {
  email: string;
  kind: "staff" | "teacher";
  role?: StaffRole;
  name?: string;
  exp: number; // epoch ms
}

function secret(): string {
  const s =
    process.env.SESSION_SECRET ||
    process.env.ENRICH_WORKER_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) throw new Error("Missing SESSION_SECRET");
  return s;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

export async function signSession(s: Omit<Session, "exp">): Promise<string> {
  const payload: Session = { ...s, exp: Date.now() + SESSION_DAYS * 86_400_000 };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if ((await hmac(body)) !== sig) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (!s.exp || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** Signed value for links in emails (unsubscribe). */
export async function signValue(value: string): Promise<string> {
  return hmac(`v:${value}`);
}

/**
 * The staff gate is on when a password or admin emails are configured.
 * With neither set (fresh local dev) the dashboard stays open.
 */
export function gateEnabled(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD || process.env.ADMIN_EMAILS);
}
