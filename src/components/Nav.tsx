"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth-actions";

/** Top bar. Teacher-facing pages (forms, "Your feedback", sign-in) show no staff links. */
export function Nav({ staff }: { staff: { name: string; role: string } | null }) {
  const path = usePathname();
  const isPublic = path.startsWith("/f/") || path.startsWith("/me") || path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/unsubscribe");
  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={path === href || (href !== "/" && path.startsWith(href)) ? "font-medium text-ink" : "text-slate-600 hover:text-ink"}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-pulse-600 text-sm font-bold text-white">P</span>
          <span className="font-semibold">Pulse</span>
          <span className="hidden text-sm text-slate-400 sm:inline">Voice of Schools</span>
        </span>
        {!isPublic && staff && (
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {link("/", "Dashboard")}
            {link("/backlog", "Backlog")}
            {link("/review", "Review")}
            {link("/tickets", "Tickets")}
            {link("/reports", "Reports")}
            {link("/sources", "Sources")}
            {link("/search", "Search")}
            {link("/channels", "Channels")}
            {link("/activity", "Activity")}
            {staff.role === "admin" && link("/admin/staff", "Staff")}
            <span className="flex items-center gap-2 border-l border-slate-200 pl-4 text-xs text-slate-500">
              {staff.name} · {staff.role}
              <form action={signOut}>
                <button className="text-pulse-600 hover:underline">Sign out</button>
              </form>
            </span>
          </nav>
        )}
      </div>
    </header>
  );
}
