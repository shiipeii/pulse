"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRealStaff } from "@/lib/auth-server";
import { VIEW_AS_COOKIE, PREVIEWABLE } from "@/lib/roles";
import type { StaffRole } from "@/lib/types";

/** Admin only: see Pulse exactly as another role sees it. */
export async function startViewAs(fd: FormData): Promise<void> {
  const s = await getRealStaff();
  const role = String(fd.get("role") ?? "") as StaffRole;
  if (s?.role !== "admin" || !PREVIEWABLE.includes(role)) redirect("/");
  cookies().set(VIEW_AS_COOKIE, role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
  redirect("/");
}

export async function stopViewAs(): Promise<void> {
  cookies().delete(VIEW_AS_COOKIE);
  redirect("/");
}
