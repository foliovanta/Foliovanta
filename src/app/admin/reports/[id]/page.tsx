import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAdminReportDetail } from "@/lib/reports/service";
import { resolveAdminActor } from "@/lib/auth/authorization";
import { can } from "@/lib/auth/permissions";

import { BackLink, DetailRow, PageHeader, Pill, formatDate } from "../../_components/ui";
import { ReportTriageControls } from "./report-triage";

export const dynamic = "force-dynamic";

export default async function AdminReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAdminReportDetail(id);
  if (!result.ok) {
    if ("failure" in result) redirect(result.failure.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
    notFound();
  }
  const r = result.report;
  const actor = await resolveAdminActor();
  const canTriage = actor.ok && can(actor.actor.role, "admin.reports.triage");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/admin/reports">← Reports</BackLink>
        <PageHeader title="Abuse report" description="Investigate and triage. Reporter identity is never shown." />
      </div>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
          <DetailRow label="Reason"><span className="capitalize">{r.reason.replace(/_/g, " ").toLowerCase()}</span></DetailRow>
          <DetailRow label="Status"><Pill value={r.status} kind="neutral" /></DetailRow>
          <DetailRow label="Reporter"><span className="capitalize">{r.reporter}</span></DetailRow>
          <DetailRow label="Target portfolio">
            <Link href={`/admin/portfolios/${r.portfolioId}`} className="text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300">
              Open portfolio detail
            </Link>
          </DetailRow>
          <DetailRow label="Portfolio moderation"><Pill value={r.portfolioModerationStatus} kind="moderation" /></DetailRow>
          <DetailRow label="Publicly visible now">{r.portfolioPubliclyEligible ? "Yes" : "No"}</DetailRow>
          <DetailRow label="Received">{formatDate(r.createdAt)}</DetailRow>
          {r.resolvedAt && <DetailRow label="Resolved">{formatDate(r.resolvedAt)}</DetailRow>}
          {r.resolutionNote && <DetailRow label="Resolution note">{r.resolutionNote}</DetailRow>}
          {r.details && (
            <DetailRow label="Details">
              <p className="whitespace-pre-wrap">{r.details}</p>
            </DetailRow>
          )}
        </dl>
      </section>

      <ReportTriageControls
        id={r.id}
        status={r.status}
        canTriage={canTriage}
        portfolioSuspended={r.portfolioModerationStatus === "SUSPENDED"}
      />
    </div>
  );
}
