import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, gateEnabled } from "@/lib/session";

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

export async function middleware(req: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session?.kind === "staff") return NextResponse.next();

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
