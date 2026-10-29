import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requirePermission } from "@/lib/auth/authorization";

import { LoadingRows, PageHeader } from "../_components/ui";
import { ReportsDirectoryClient } from "./reports-directory-client";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const authz = await requirePermission("admin.reports.read");
  if (!authz.ok) redirect(authz.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Abuse reports against public portfolios. Read & triage." />
      <Suspense fallback={<LoadingRows label="Loading reports…" />}>
        <ReportsDirectoryClient />
      </Suspense>
    </div>
  );
}
