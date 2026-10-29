import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requirePermission } from "@/lib/auth/authorization";

import { LoadingRows, PageHeader } from "../_components/ui";
import { AuditDirectoryClient } from "./audit-directory-client";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogsPage() {
  // SUPER_ADMIN-only (admin.audit.read). Re-checked in the API/service too.
  const authz = await requirePermission("admin.audit.read");
  if (!authz.ok) redirect(authz.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit logs" description="Immutable record of privileged actions. Read-only." />
      <Suspense fallback={<LoadingRows label="Loading audit log…" />}>
        <AuditDirectoryClient />
      </Suspense>
    </div>
  );
}
