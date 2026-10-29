import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requirePermission } from "@/lib/auth/authorization";

import { LoadingRows, PageHeader } from "../_components/ui";
import { UsersDirectoryClient } from "./users-directory-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const authz = await requirePermission("admin.users.read");
  if (!authz.ok) {
    redirect(authz.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Browse accounts across the platform. Read-only." />
      <Suspense fallback={<LoadingRows label="Loading users…" />}>
        <UsersDirectoryClient />
      </Suspense>
    </div>
  );
}
