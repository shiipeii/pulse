"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth-actions";
import { stopViewAs } from "@/app/view-as-actions";
import { roleInfo } from "@/lib/roles";

export interface NavStaff {
  name: string;
  role: string;
  viewingAs?: string;
}

/**
 * Top bar. Each role gets its own menu (see lib/roles.ts), so people only see
 * what they use. Teacher-facing pages (forms, "Your feedback", sign-in) show no staff links.
 */
export function Nav({ staff }: { staff: NavStaff | null }) {
  const path = usePathname();
  const isPublic = path.startsWith("/f/") || path.startsWith("/me") || path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/unsubscribe");
  const info = roleInfo(staff?.role);
  const link = (href: string, label: string) => {
    const base = href.split("?")[0];
    const active = base === "/" ? path === "/" : path.startsWith(base);
    return (
      <Link key={href} href={href} className={active ? "font-medium text-ink" : "text-slate-600 hover:text-ink"}>
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      {!isPublic && staff?.viewingAs && (
        <div className="bg-amber-100 text-amber-900">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-2 text-sm">
            <span>
              You&apos;re viewing Pulse as <strong>{info.label}</strong>. The menu, pages and buttons work exactly as they would for them.
            </span>
            <form action={stopViewAs}>
              <button className="rounded-lg bg-amber-900 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800">Back to admin</button>
            </form>
          </div>
        </div>
      )}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-pulse-600 text-sm font-bold text-white">P</span>
          <span className="font-semibold">Pulse</span>
          <span className="hidden text-sm text-slate-400 sm:inline">Voice of Schools</span>
        </Link>
        {!isPublic && staff && (
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {info.nav.map((n) => link(n.href, n.label))}
            <span className="flex items-center gap-2 border-l border-slate-200 pl-4 text-xs text-slate-500">
              {staff.name} · {staff.viewingAs ? `admin, viewing as ${info.label}` : info.label}
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
