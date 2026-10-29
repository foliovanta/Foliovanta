import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requirePermission } from "@/lib/auth/authorization";

import { LoadingRows, PageHeader } from "../_components/ui";
import { FeedbackDirectoryClient } from "./feedback-directory-client";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const authz = await requirePermission("admin.feedback.read");
  if (!authz.ok) redirect(authz.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Feedback" description="Product feedback from creators. Read & triage." />
      <Suspense fallback={<LoadingRows label="Loading feedback…" />}>
        <FeedbackDirectoryClient />
      </Suspense>
    </div>
  );
}
