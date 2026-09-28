"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { sendMagicLink } from "@/lib/magic-link";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session";
import { adminEmails, isAllowedTeacherEmail, allowedTeacherDomains } from "@/lib/auth-server";
import type { StaffRole } from "@/lib/types";
import { VIEW_AS_COOKIE } from "@/lib/roles";

export interface AuthState {
  ok: boolean;
  message?: string;
  error?: string;
}

const safeNext = (n: string, fallback: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : fallback);

async function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

async function staffRole(email: string): Promise<{ role: StaffRole; name?: string } | null> {
  if (adminEmails().includes(email)) return { role: "admin" };
  const { data } = await supabaseAdmin().from("staff").select("role, name").eq("email", email).maybeSingle();
  return data ? { role: data.role as StaffRole, name: data.name ?? undefined } : null;
}

/** Staff: email a sign-in link (only to registered staff). */
export async function requestStaffLink(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(fd.get("next") ?? "/"), "/");
  if (!email.includes("@")) return { ok: false, error: "Enter your work email." };
  // Same answer whether or not the address is registered (no account probing).
  const role = await staffRole(email);
  if (role) {
    try {
      await sendMagicLink(email, "staff", next);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not send the email." };
    }
  }
  return { ok: true, message: "If that address has staff access, a sign-in link is on its way. It works once and expires soon." };
}

/** Teacher: email a sign-in link (MOE domains only, FR-50). */
export async function requestTeacherLink(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "Enter your MOE email." };
  if (!isAllowedTeacherEmail(email)) {
    return { ok: false, error: `Please use your MOE email (${allowedTeacherDomains().map((d) => "@" + d).join(" or ")}).` };
  }
  try {
    await sendMagicLink(email, "teacher", "/me");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send the email." };
  }
  return { ok: true, message: `We've emailed a sign-in link to ${email}. It works once and expires soon.` };
}

/** Called by /auth/callback with the token from the link. Returns where to go next. */
export async function completeSignIn(accessToken: string, kind: string, next: string): Promise<{ ok: boolean; to?: string; error?: string }> {
  const { data, error } = await supabaseAdmin().auth.getUser(accessToken);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return { ok: false, error: "This sign-in link is invalid or has expired. Please request a new one." };

  if (kind === "staff") {
    const role = await staffRole(email);
    if (!role) return { ok: false, error: "This email doesn't have staff access. Ask an admin to add you." };
    await setSessionCookie(await signSession({ email, kind: "staff", role: role.role, name: role.name }));
    return { ok: true, to: safeNext(next, "/") };
  }
  if (!isAllowedTeacherEmail(email)) return { ok: false, error: "Please sign in with your MOE email." };
  await setSessionCookie(await signSession({ email, kind: "teacher" }));
  return { ok: true, to: safeNext(next, "/me") };
}

/** Break-glass shared password (demo / before staff accounts exist). Signs in as admin. */
export async function passwordLogin(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const password = process.env.DASHBOARD_PASSWORD;
  const attempt = String(fd.get("password") ?? "");
  const next = safeNext(String(fd.get("next") ?? "/"), "/");
  if (!password || attempt !== password) return { ok: false, error: "Wrong password." };
  await setSessionCookie(await signSession({ email: "team-password", kind: "staff", role: "admin", name: "Team (shared password)" }));
  redirect(next);
}

export async function signOut(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  cookies().delete(VIEW_AS_COOKIE);
  redirect("/login");
}

export async function teacherSignOut(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  redirect("/me");
}
