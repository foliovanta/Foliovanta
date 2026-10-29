import "server-only";

import type { MediaAsset, MediaAssetPurpose, MediaAssetStatus } from "@/generated/prisma/client";
import { prisma, TRANSACTION_OPTIONS } from "@/lib/db/prisma";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";
import { ASSET_QUOTA, INITIATIONS_PER_MINUTE } from "@/lib/media/constants";
import { canTransitionMediaStatus } from "@/lib/media/lifecycle";
import { buildStorageKey, isAllowedImageType, isValidUploadSize } from "@/lib/media/validation";

export type CreatePendingAssetInput = {
  portfolioId: string;
  purpose: MediaAssetPurpose;
  contentType: string;
  byteSize: number;
};

export type CreatePendingAssetError =
  | PortfolioAccessError
  | "NOT_FOUND"
  | "INVALID_TYPE"
  | "INVALID_SIZE"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED";

type PendingAsset = Pick<MediaAsset, "id" | "storageKey" | "status" | "purpose">;

// Active = occupies a quota slot. DELETING/FAILED assets are being cleaned up
// and do not count.
const ACTIVE_STATUSES: MediaAssetStatus[] = ["PENDING", "READY"];

/**
 * Creates a PENDING asset for a signed upload. Validates the *claimed* type and
 * size here; the real bytes are verified by the server before READY (Step 2).
 * Serializes per-portfolio so concurrent/duplicate initiations can't exceed the
 * quota.
 */
export async function createPendingAsset(
  clerkUserId: string,
  input: CreatePendingAssetInput,
): Promise<{ ok: true; asset: PendingAsset } | { ok: false; error: CreatePendingAssetError }> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  if (!isAllowedImageType(input.contentType)) {
    return { ok: false, error: "INVALID_TYPE" };
  }
  if (!isValidUploadSize(input.byteSize)) {
    return { ok: false, error: "INVALID_SIZE" };
  }

  const ownerId = resolved.userId;
  const contentType = input.contentType;
  const storageKey = buildStorageKey(input.purpose, contentType);
  const quota = ASSET_QUOTA[input.purpose];

  return prisma.$transaction(async (tx) => {
    const portfolio = await tx.portfolio.findFirst({
      where: { id: input.portfolioId, ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!portfolio) {
      return { ok: false, error: "NOT_FOUND" } as const;
    }

    // Serialize concurrent initiations for this portfolio so the count→create is
    // atomic (same pattern as portfolio creation).
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.portfolioId})) IS NULL AS locked`;

    // Abuse guard: bounded new assets per portfolio per minute (counts all
    // recent creations, so concurrency can't beat it).
    const recent = await tx.mediaAsset.count({
      where: { portfolioId: input.portfolioId, createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recent >= INITIATIONS_PER_MINUTE) {
      return { ok: false, error: "RATE_LIMITED" } as const;
    }

    const active = await tx.mediaAsset.count({
      where: {
        portfolioId: input.portfolioId,
        purpose: input.purpose,
        status: { in: ACTIVE_STATUSES },
      },
    });
    if (active >= quota) {
      return { ok: false, error: "QUOTA_EXCEEDED" } as const;
    }

    const asset = await tx.mediaAsset.create({
      data: {
        ownerId,
        portfolioId: input.portfolioId,
        purpose: input.purpose,
        contentType,
        byteSize: input.byteSize,
        storageKey,
        status: "PENDING",
      },
      select: { id: true, storageKey: true, status: true, purpose: true },
    });
    return { ok: true, asset } as const;
  }, TRANSACTION_OPTIONS);
}

export type TransitionError =
  PortfolioAccessError | "NOT_FOUND" | "INVALID_TRANSITION" | "CONFLICT";

// Verified metadata recorded when moving to READY.
export type VerifiedMedia = {
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
};

/**
 * Moves an owned asset to a new lifecycle state under the transition rules. A
 * transition to the asset's current state is an idempotent no-op (safe for
 * retries); an illegal transition is rejected; a concurrent change is reported
 * as CONFLICT via a status-guarded conditional update.
 */
export async function transitionAsset(
  clerkUserId: string,
  assetId: string,
  to: MediaAssetStatus,
  verified?: VerifiedMedia,
): Promise<{ ok: true; status: MediaAssetStatus } | { ok: false; error: TransitionError }> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }
  const ownerId = resolved.userId;

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, ownerId },
    select: { status: true },
  });
  if (!asset) {
    return { ok: false, error: "NOT_FOUND" };
  }
  if (asset.status === to) {
    return { ok: true, status: to }; // idempotent
  }
  if (!canTransitionMediaStatus(asset.status, to)) {
    return { ok: false, error: "INVALID_TRANSITION" };
  }

  const data =
    to === "READY"
      ? {
          status: to,
          readyAt: new Date(),
          ...(verified
            ? {
                contentType: verified.contentType,
                byteSize: verified.byteSize,
                width: verified.width,
                height: verified.height,
              }
            : {}),
        }
      : to === "DELETING"
        ? { status: to, deletedAt: new Date() }
        : { status: to };

  // Guard on the observed status so two concurrent transitions can't both win.
  const updated = await prisma.mediaAsset.updateMany({
    where: { id: assetId, ownerId, status: asset.status },
    data,
  });
  if (updated.count === 0) {
    return { ok: false, error: "CONFLICT" };
  }
  return { ok: true, status: to };
}

export async function getOwnedAsset(
  clerkUserId: string,
  assetId: string,
): Promise<
  { ok: true; asset: MediaAsset } | { ok: false; error: PortfolioAccessError | "NOT_FOUND" }
> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, ownerId: resolved.userId },
  });
  return asset ? { ok: true, asset } : { ok: false, error: "NOT_FOUND" };
}

type SnapshotAssetRefs = {
  profile?: { avatarAssetId?: string | null };
  projects?: Array<{ coverAssetId?: string | null }>;
};

function snapshotReferences(snapshot: unknown, assetId: string): boolean {
  const snap = snapshot as SnapshotAssetRefs;
  if (snap?.profile?.avatarAssetId === assetId) return true;
  return Array.isArray(snap?.projects) && snap.projects.some((p) => p?.coverAssetId === assetId);
}

/**
 * Whether any published version of the asset's portfolio still embeds this
 * asset id. Cleanup must refuse to hard-delete such an asset so old published
 * versions keep rendering.
 */
export async function isAssetReferencedByPublishedVersion(assetId: string): Promise<boolean> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { portfolioId: true },
  });
  if (!asset) return false;

  const versions = await prisma.portfolioVersion.findMany({
    where: { portfolioId: asset.portfolioId },
    select: { snapshot: true },
  });
  return versions.some((version) => snapshotReferences(version.snapshot, assetId));
}
