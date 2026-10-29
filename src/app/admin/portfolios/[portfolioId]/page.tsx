import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAdminPortfolioDetail } from "@/lib/admin/portfolios-directory";
import { getLatestModerationNote } from "@/lib/admin/moderation";
import { resolveAdminActor } from "@/lib/auth/authorization";
import { can } from "@/lib/auth/permissions";

import { BackLink, DetailRow, PageHeader, Pill, formatDate } from "../../_components/ui";
import { PortfolioModerationControls } from "./portfolio-moderation";

export const dynamic = "force-dynamic";

export default async function AdminPortfolioDetailPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const result = await getAdminPortfolioDetail(portfolioId);

  if (!result.ok) {
    if ("failure" in result) {
      redirect(result.failure.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
    }
    notFound();
  }

  const p = result.portfolio;
  const [actor, note] = await Promise.all([
    resolveAdminActor(),
    getLatestModerationNote("portfolio", p.id),
  ]);
  const canModerate = actor.ok && can(actor.actor.role, "admin.portfolios.moderate");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/admin/portfolios">← Portfolios</BackLink>
        <PageHeader title={p.title || "Untitled portfolio"} description="Portfolio overview. Read-only." />
      </div>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
          <DetailRow label="Portfolio ID">
            <span className="font-mono text-xs">{p.id}</span>
          </DetailRow>
          <DetailRow label="Owner">
            <Link
              href={`/admin/users/${p.ownerId}`}
              className="text-indigo-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-indigo-300"
            >
              {p.ownerDisplayName}
            </Link>
            <span className="ml-2 font-mono text-xs text-zinc-400">/{p.ownerPublicSlug}/{p.ownerUsername}</span>
          </DetailRow>
          <DetailRow label="Publication">
            <Pill value={p.publicationStatus} kind="publication" />
          </DetailRow>
          <DetailRow label="Moderation">
            <Pill value={p.moderationStatus} kind="moderation" />
          </DetailRow>
          <DetailRow label="Active version">{p.activeVersionNumber ?? "—"}</DetailRow>
          <DetailRow label="Created">{formatDate(p.createdAt)}</DetailRow>
          <DetailRow label="Updated">{formatDate(p.updatedAt)}</DetailRow>
          <DetailRow label="Published">{p.publishedAt ? formatDate(p.publishedAt) : "—"}</DetailRow>
          {p.deletedAt && <DetailRow label="Deleted">{formatDate(p.deletedAt)}</DetailRow>}
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Public eligibility
        </h2>
        {p.publiclyEligible ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <Pill value="PUBLICLY VISIBLE" kind="publication" />
              This portfolio is live at its canonical URL.
            </p>
            {/* Only a safe link to the PUBLIC page — no owner-only preview/draft. */}
            <a
              href={p.canonicalUrl ?? undefined}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-10 w-fit items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              View public page ↗
            </a>
            <p className="font-mono text-xs break-all text-zinc-400">{p.canonicalUrl}</p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Not publicly visible. No public link or draft content is available here.
            </p>
            <ul className="list-inside list-disc text-sm text-zinc-500 dark:text-zinc-400">
              {p.visibilityReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <PortfolioModerationControls
        portfolioId={p.id}
        moderationStatus={p.moderationStatus}
        canModerate={canModerate}
        note={note ? { reason: note.reason, at: note.at } : null}
      />
    </div>
  );
}
