import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/auth-server";
import { gateEnabled } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse — Voice of Schools",
  description: "Feedback intelligence for MOE product teams",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  const staff = s?.kind === "staff" ? { name: s.name || s.email, role: s.role ?? "stakeholder" } : !gateEnabled() ? { name: "Local dev", role: "admin" } : null;
  return (
    <html lang="en">
      <body>
        <Nav staff={staff} />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
