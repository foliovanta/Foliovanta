import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAdminFeedbackDetail } from "@/lib/feedback/service";
import { resolveAdminActor } from "@/lib/auth/authorization";
import { can } from "@/lib/auth/permissions";

import { BackLink, DetailRow, PageHeader, Pill, formatDate } from "../../_components/ui";
import { FeedbackTriageControls } from "./feedback-triage";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAdminFeedbackDetail(id);
  if (!result.ok) {
    if ("failure" in result) redirect(result.failure.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
    notFound();
  }
  const f = result.feedback;
  const actor = await resolveAdminActor();
  const canTriage = actor.ok && can(actor.actor.role, "admin.feedback.triage");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/admin/feedback">← Feedback</BackLink>
        <PageHeader title="Feedback" description="Product feedback detail." />
      </div>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
          <DetailRow label="Category"><Pill value={f.category} kind="neutral" /></DetailRow>
          <DetailRow label="Status"><Pill value={f.status} kind="neutral" /></DetailRow>
          <DetailRow label="From">
            {f.submitterName}
            <span className="ml-2 font-mono text-xs text-zinc-400">/{f.submitterPublicSlug}</span>
          </DetailRow>
          <DetailRow label="Related portfolio">
            {f.portfolioId ? (
              <Link href={`/admin/portfolios/${f.portfolioId}`} className="text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300">
                View portfolio
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Received">{formatDate(f.createdAt)}</DetailRow>
          {f.resolvedAt && <DetailRow label="Resolved">{formatDate(f.resolvedAt)}</DetailRow>}
          {f.resolutionNote && <DetailRow label="Resolution note">{f.resolutionNote}</DetailRow>}
          <DetailRow label="Message">
            <p className="whitespace-pre-wrap">{f.message}</p>
          </DetailRow>
        </dl>
      </section>

      <FeedbackTriageControls id={f.id} status={f.status} canTriage={canTriage} />
    </div>
  );
}
