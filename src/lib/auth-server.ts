import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, gateEnabled, type Session } from "./session";
import { VIEW_AS_COOKIE, PREVIEWABLE } from "./roles";
import type { StaffRole } from "./types";

/** A staff session, plus the role an admin is previewing with "View as". */
export type StaffSession = Session & { viewingAs?: StaffRole };

/** Current session from the cookie (or null). */
export async function getSession(): Promise<Session | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

/** The signed-in staff member as they really are (ignores "View as"). */
export async function getRealStaff(): Promise<StaffSession | null> {
  const s = await getSession();
  if (s?.kind === "staff") return s;
  if (!gateEnabled()) return { email: "local-dev", kind: "staff", role: "admin", name: "Local dev", exp: Infinity };
  return null;
}

/**
 * The effective staff member: an admin using "View as" is treated as that
 * role everywhere (menus, home page and permissions), like the middleware.
 */
export async function getStaff(): Promise<StaffSession | null> {
  const s = await getRealStaff();
  if (!s) return null;
  const viewAs = cookies().get(VIEW_AS_COOKIE)?.value as StaffRole | undefined;
  if (s.role === "admin" && viewAs && PREVIEWABLE.includes(viewAs)) {
    return { ...s, role: viewAs, viewingAs: viewAs };
  }
  return s;
}

export class ForbiddenError extends Error {}

/**
 * Guard for server actions. Stakeholders are read-only; admin-only actions
 * (staff, channels, sources) pass ["admin"].
 */
export async function requireStaff(roles: StaffRole[] = ["admin", "pm", "engineer"]): Promise<StaffSession> {
  const s = await getStaff();
  if (!s || !s.role || !roles.includes(s.role)) {
    throw new ForbiddenError("You don't have permission to do that.");
  }
  return s;
}

export function displayName(s: Session): string {
  return s.name || s.email;
}

/** Emails allowed to sign in as teachers (FR-50). A blank setting falls back to MOE. */
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
