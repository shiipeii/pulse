import { bearer } from "./auth";

/**
 * Scheduled endpoints accept CRON_SECRET (Vercel Cron sends it automatically
 * as a Bearer token when the env var is set) or ENRICH_WORKER_SECRET.
 */
export function cronAuthorized(headers: Headers): boolean {
  const token = bearer(headers);
  const allowed = [process.env.CRON_SECRET, process.env.ENRICH_WORKER_SECRET].filter(Boolean);
  if (allowed.length === 0) return true; // local dev
  return Boolean(token && allowed.includes(token));
}
