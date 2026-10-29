import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requirePermission } from "@/lib/auth/authorization";

import { LoadingRows, PageHeader } from "../_components/ui";
import { PortfoliosDirectoryClient } from "./portfolios-directory-client";

export const dynamic = "force-dynamic";

export default async function AdminPortfoliosPage() {
  const authz = await requirePermission("admin.portfolios.read");
  if (!authz.ok) {
    redirect(authz.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Portfolios"
        description="Browse portfolios across all owners. Read-only."
      />
      <Suspense fallback={<LoadingRows label="Loading portfolios…" />}>
        <PortfoliosDirectoryClient />
      </Suspense>
    </div>
  );
}
