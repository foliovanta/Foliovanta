"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { type Permission, type UserRole, can } from "@/lib/auth/permissions";

type NavItem = {
  key: string;
  label: string;
  href: string;
  permission: Permission;
  // Only Overview has a real implementation this milestone; the rest are shown
  // as accurate "not yet available" placeholders, never fake dashboards.
  available: boolean;
};

const NAV: readonly NavItem[] = [
  { key: "overview", label: "Overview", href: "/admin", permission: "admin.overview.read", available: true },
  { key: "users", label: "Users", href: "/admin/users", permission: "admin.users.read", available: true },
  { key: "portfolios", label: "Portfolios", href: "/admin/portfolios", permission: "admin.portfolios.read", available: true },
  { key: "reports", label: "Reports", href: "/admin/reports", permission: "admin.reports.read", available: true },
  { key: "feedback", label: "Feedback", href: "/admin/feedback", permission: "admin.feedback.read", available: true },
  { key: "audit", label: "Audit logs", href: "/admin/audit-logs", permission: "admin.audit.read", available: true },
];

const ROLE_LABEL: Record<UserRole, string> = {
  USER: "User",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super admin",
};

export function AdminShell({
  actor,
  children,
}: {
  actor: { role: UserRole; name: string | null; email: string | null };
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Role-aware: an item appears only if the actor's role carries its permission.
  // Audit logs therefore show only for SUPER_ADMIN.
  const items = NAV.filter((item) => can(actor.role, item.permission));

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Mobile overlay */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-zinc-900/40 md:hidden"
        />
      )}

      <Sidebar
        items={items}
        actor={actor}
        pathname={pathname}
        open={menuOpen}
        onNavigate={() => setMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="admin-sidebar"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:text-zinc-200"
          >
            <span aria-hidden className="text-lg">
              ≡
            </span>
            <span className="sr-only">Menu</span>
          </button>
          <span className="text-sm font-semibold tracking-tight">Foliovanta Admin</span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  items,
  actor,
  pathname,
  open,
  onNavigate,
}: {
  items: readonly NavItem[];
  actor: { role: UserRole; name: string | null; email: string | null };
  pathname: string;
  open: boolean;
  onNavigate: () => void;
}) {
  return (
    <aside
      id="admin-sidebar"
      className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform md:static md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-900 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" aria-hidden />
        <span className="text-sm font-semibold tracking-tight">Foliovanta Admin</span>
      </div>

      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            if (!item.available) {
              return (
                <li key={item.key}>
                  <span
                    aria-disabled
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-400 dark:text-zinc-600"
                  >
                    {item.label}
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      Soon
                    </span>
                  </span>
                </li>
              );
            }
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none ${
                    active
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {actor.name || actor.email || "Administrator"}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {ROLE_LABEL[actor.role]}
          </span>
        </p>
        <Link
          href="/dashboard"
          className="mt-3 inline-block text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Back to app
        </Link>
      </div>
    </aside>
  );
}
