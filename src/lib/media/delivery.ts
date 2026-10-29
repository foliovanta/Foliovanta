import "server-only";

import { prisma } from "@/lib/db/prisma";
import { evaluatePublicVisibility } from "@/lib/publishing/visibility";

export type MediaAccess = {
  storageKey: string;
  contentType: string;
  visibility: "public" | "private";
};

type SnapshotRefs = {
  profile?: { avatarAssetId?: string | null };
  projects?: Array<{ coverAssetId?: string | null }>;
};

function snapshotReferences(snapshot: unknown, assetId: string): boolean {
  const snap = snapshot as SnapshotRefs;
  if (snap?.profile?.avatarAssetId === assetId) return true;
  return Array.isArray(snap?.projects) && snap.projects.some((p) => p?.coverAssetId === assetId);
}

/**
 * Decides whether a viewer may receive an asset's bytes, and under what cache
 * policy — a UUID alone is never authorization.
 *
 * - The authenticated owner (ACTIVE) may always view their own asset → private,
 *   no-store (covers draft + private preview).
 * - Anyone may view it ONLY if it is referenced by the portfolio's CURRENT active
 *   published snapshot AND the portfolio is publicly visible (published, not
 *   suspended, not deleted, owner ACTIVE) → public, cacheable. A merely retained
 *   historical version does not grant public access.
 * Returns null (→ uniform 404) otherwise.
 */
export async function resolveMediaAccess(
  assetId: string,
  viewerClerkUserId: string | null,
): Promise<MediaAccess | null> {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, status: "READY", deletedAt: null },
    select: {
      storageKey: true,
      contentType: true,
      owner: { select: { clerkUserId: true, status: true } },
      portfolio: {
        select: {
          publicationStatus: true,
          moderationStatus: true,
          deletedAt: true,
          activeVersionId: true,
          activeVersion: { select: { snapshot: true } },
        },
      },
    },
  });
  if (!asset || !asset.contentType) {
    return null;
  }

  const ownerActive = asset.owner.status === "ACTIVE";

  if (viewerClerkUserId && viewerClerkUserId === asset.owner.clerkUserId && ownerActive) {
    return { storageKey: asset.storageKey, contentType: asset.contentType, visibility: "private" };
  }

  // Use the single shared public-visibility policy — never a separate predicate.
  const p = asset.portfolio;
  const { eligible } = evaluatePublicVisibility({
    deletedAt: p.deletedAt,
    publicationStatus: p.publicationStatus,
    moderationStatus: p.moderationStatus,
    activeVersionId: p.activeVersionId,
    ownerStatus: asset.owner.status,
  });

  if (eligible && p.activeVersion && snapshotReferences(p.activeVersion.snapshot, assetId)) {
    return { storageKey: asset.storageKey, contentType: asset.contentType, visibility: "public" };
  }

  return null;
}
