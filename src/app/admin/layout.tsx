import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveAdminActor } from "@/lib/auth/authorization";

import { AdminShell } from "./admin-shell";

export const metadata: Metadata = {
  title: "Admin · Foliovanta",
  // The admin surface must never be indexed.
  robots: { index: false, follow: false },
};

// Admin data is request-time and per-administrator; never statically cached.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const resolved = await resolveAdminActor();

  // Authorization is enforced here (server-side) in addition to each route/
  // service. Anonymous → sign-in; any authenticated non-admin → their dashboard,
  // which never reveals that an admin surface exists.
  if (!resolved.ok) {
    redirect(resolved.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
  }

  return (
    <AdminShell
      actor={{
        role: resolved.actor.role,
        name: resolved.actor.name,
        email: resolved.actor.email,
      }}
    >
      {children}
    </AdminShell>
  );
}
