import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, gateEnabled } from "@/lib/session";
import { VIEW_AS_COOKIE, PREVIEWABLE } from "@/lib/roles";
import type { StaffRole } from "@/lib/types";

/**
 * Staff pages need a staff session. Public: hosted forms, the teacher portal
 * (/me — it has its own sign-in), sign-in pages, unsubscribe, and machine
 * endpoints that carry their own secrets (ingest, enrich, cron, mailbox).
 */
const PUBLIC_PREFIXES = [
  "/f/",
  "/me",
  "/login",
  "/auth/",
  "/unsubscribe",
  "/api/ingest",
  "/api/enrich",
  "/api/cron",
  "/api/mailbox",
];

/**
 * Pages each role may not open, even by typing the address. Stakeholders see
 * themes and counts only (no teacher words, names or emails), so the pages
 * that show raw reports are closed to them. Staff management is admin-only.
 */
const BLOCKED: Record<StaffRole, string[]> = {
  admin: [],
  pm: ["/admin"],
  engineer: ["/admin", "/channels", "/import"],
  stakeholder: ["/admin", "/review", "/search", "/api/search", "/activity", "/channels", "/import", "/sources", "/tickets", "/dashboard", "/priorities"],
};

export async function middleware(req: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session?.kind === "staff") {
    // An admin using "View as" is treated as that role everywhere.
    const viewAs = req.cookies.get(VIEW_AS_COOKIE)?.value as StaffRole | undefined;
    const role: StaffRole =
      session.role === "admin" && viewAs && PREVIEWABLE.includes(viewAs) ? viewAs : (session.role ?? "stakeholder");
    if (BLOCKED[role].some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not available for your role" }, { status: 403 });
      const home = req.nextUrl.clone();
      home.pathname = "/";
      home.search = "";
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
