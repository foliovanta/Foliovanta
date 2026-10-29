import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAuditLogDetail } from "@/lib/admin/audit-explorer";

import { BackLink, DetailRow, PageHeader, Pill } from "../../_components/ui";

export const dynamic = "force-dynamic";

// Only link to admin records the viewer is already authorized to open.
function relatedHref(targetType: string | null, targetId: string | null): string | null {
  if (!targetId) return null;
  if (targetType === "user") return `/admin/users/${targetId}`;
  if (targetType === "portfolio") return `/admin/portfolios/${targetId}`;
  if (targetType === "feedback") return `/admin/feedback/${targetId}`;
  if (targetType === "abuse_report") return `/admin/reports/${targetId}`;
  return null;
}

export default async function AdminAuditDetailPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const result = await getAuditLogDetail(auditId);
  if (!result.ok) {
    if ("failure" in result) redirect(result.failure.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
    notFound();
  }
  const e = result.entry;
  const related = relatedHref(e.targetType, e.targetId);
  const metadataEntries = Object.entries(e.metadata);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/admin/audit-logs">← Audit logs</BackLink>
        <PageHeader title="Audit record" description="Immutable record of a privileged action." />
      </div>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
          <DetailRow label="When">{new Date(e.createdAt).toLocaleString()}</DetailRow>
          <DetailRow label="Action"><span className="font-mono text-xs">{e.action}</span></DetailRow>
          <DetailRow label="Outcome">
            <Pill value={e.outcome} kind={e.outcome === "DENIED" || e.outcome === "FAILURE" ? "moderation" : "neutral"} />
          </DetailRow>
          <DetailRow label="Summary">{e.summary || "—"}</DetailRow>
          <DetailRow label="Actor">
            {e.actorUserId ? (
              <>
                {e.actorLabel ?? "Unknown"}
                <Link href={`/admin/users/${e.actorUserId}`} className="ml-2 font-mono text-xs text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300">
                  {e.actorUserId}
                </Link>
              </>
            ) : (
              <span className="text-zinc-500">System / operator</span>
            )}
          </DetailRow>
          <DetailRow label="Target">
            {e.targetType ? (
              <>
                <span className="font-mono text-xs">{e.targetType}</span>
                {related ? (
                  <Link href={related} className="ml-2 text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300">
                    open record
                  </Link>
                ) : e.targetId ? (
                  <span className="ml-2 font-mono text-xs text-zinc-400">{e.targetId}</span>
                ) : null}
              </>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Correlation ID">
            {e.correlationId ? <span className="font-mono text-xs">{e.correlationId}</span> : "—"}
          </DetailRow>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Safe metadata
        </h2>
        {metadataEntries.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">No safe metadata to show.</p>
        ) : (
          <dl className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {metadataEntries.map(([key, value]) => (
              <DetailRow key={key} label={key}>
                {String(value)}
              </DetailRow>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
