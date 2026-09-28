import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { getStaff } from "@/lib/auth-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse — Voice of Schools",
  description: "Feedback intelligence for MOE product teams",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Effective role: an admin using "View as" gets that role's menu.
  const s = await getStaff();
  const staff = s ? { name: s.name || s.email, role: s.role ?? "stakeholder", viewingAs: s.viewingAs } : null;
  return (
    <html lang="en">
      <body>
        <Nav staff={staff} />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
