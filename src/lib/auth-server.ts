import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, gateEnabled, type Session } from "./session";
import type { StaffRole } from "./types";
import { VIEW_AS_COOKIE, PREVIEWABLE } from "./roles";

/** Current session from the cookie (or null). */
export async function getSession(): Promise<Session | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

/** The signed-in staff member with their real role (ignores "View as"). */
export async function getRealStaff(): Promise<Session | null> {
  const s = await getSession();
  if (s?.kind === "staff") return s;
  if (!gateEnabled()) return { email: "local-dev", kind: "staff", role: "admin", name: "Local dev", exp: Infinity };
  return null;
}

/**
 * Staff session as the app should treat it. When an admin uses "View as", the
 * whole app (menu, home, buttons and permissions) behaves as that role, so the
 * preview is faithful. View as can only lower access, never raise it.
 */
export async function getStaff(): Promise<(Session & { viewingAs?: StaffRole }) | null> {
  const s = await getRealStaff();
  if (!s || s.role !== "admin") return s;
  const v = cookies().get(VIEW_AS_COOKIE)?.value as StaffRole | undefined;
  if (v && PREVIEWABLE.includes(v)) return { ...s, role: v, viewingAs: v };
  return s;
}

export class ForbiddenError extends Error {}

/**
 * Guard for server actions. Stakeholders are read-only; admin-only actions
 * (staff, channels, sources) pass ["admin"].
 */
export async function requireStaff(roles: StaffRole[] = ["admin", "pm", "engineer"]): Promise<Session> {
  const s = await getStaff();
  if (!s || !s.role || !roles.includes(s.role)) {
    throw new ForbiddenError("You don't have permission to do that.");
  }
  return s;
}

export function displayName(s: Session): string {
  return s.name || s.email;
}

/** Emails allowed to sign in as teachers (FR-50). */
export function allowedTeacherDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS?.trim() || "moe.edu.sg,moe.gov.sg")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isAllowedTeacherEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return allowedTeacherDomains().some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
