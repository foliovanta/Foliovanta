import "server-only";

import { prisma } from "@/lib/db/prisma";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";
import { loadPortfolioDraftInput } from "@/lib/publishing/draft-loader";
import { type ReadinessResult, evaluatePublishReadiness } from "@/lib/publishing/publish-readiness";
import { buildSnapshot } from "@/lib/publishing/snapshot";
import { computeSnapshotHash } from "@/lib/publishing/publish-service";

type PublicationStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
type ModerationStatus = "CLEAR" | "UNDER_REVIEW" | "SUSPENDED";

export type ActiveVersionMeta = {
  versionNumber: number;
  publishedAt: Date;
  templateId: string;
  templateVersion: string;
};

export type PublishStatus = {
  slug: string;
  // Owner's numeric public identity (as a string) + current URL username, used
  // to build the public link. Not an authorization key.
  publicSlug: string;
  username: string;
  publicationStatus: PublicationStatus;
  moderationStatus: ModerationStatus;
  revision: bigint;
  publishedAt: Date | null;
  // Honest "published, with edits since": compares the current draft's content
  // hash to the active version's hash (a reverted edit → false even though the
  // revision advanced). Only meaningful while PUBLISHED.
  hasUnpublishedChanges: boolean;
  readiness: ReadinessResult;
  activeVersion: ActiveVersionMeta | null;
};

export type PublishStatusResult =
  { ok: true; status: PublishStatus } | { ok: false; error: PortfolioAccessError | "NOT_FOUND" };

export async function getPublishStatus(
  clerkUserId: string,
  portfolioId: string,
): Promise<PublishStatusResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: {
      slug: true,
      owner: { select: { publicSlug: true, username: true } },
      publicationStatus: true,
      moderationStatus: true,
      draftRevision: true,
      publishedAt: true,
      activeVersion: {
        select: {
          versionNumber: true,
          contentHash: true,
          sourceDraftRevision: true,
          publishedAt: true,
          templateId: true,
          templateVersion: true,
        },
      },
    },
  });
  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const draft = await loadPortfolioDraftInput(prisma, portfolioId);
  const readiness = evaluatePublishReadiness(draft);

  let hasUnpublishedChanges = false;
  const active = portfolio.activeVersion;
  if (portfolio.publicationStatus === "PUBLISHED" && active) {
    if (readiness.ok) {
      try {
        hasUnpublishedChanges = computeSnapshotHash(buildSnapshot(draft)) !== active.contentHash;
      } catch {
        // Draft can't be snapshotted despite readiness; fall back to revision.
        hasUnpublishedChanges = portfolio.draftRevision !== active.sourceDraftRevision;
      }
    } else {
      // Not publishable as-is → it has diverged from the live version.
      hasUnpublishedChanges = portfolio.draftRevision !== active.sourceDraftRevision;
    }
  }

  return {
    ok: true,
    status: {
      slug: portfolio.slug,
      publicSlug: portfolio.owner.publicSlug.toString(),
      username: portfolio.owner.username,
      publicationStatus: portfolio.publicationStatus,
      moderationStatus: portfolio.moderationStatus,
      revision: portfolio.draftRevision,
      publishedAt: portfolio.publishedAt,
      hasUnpublishedChanges,
      readiness,
      // Only non-private metadata — never the snapshot or content hash.
      activeVersion: active
        ? {
            versionNumber: active.versionNumber,
            publishedAt: active.publishedAt,
            templateId: active.templateId,
            templateVersion: active.templateVersion,
          }
        : null,
    },
  };
}
