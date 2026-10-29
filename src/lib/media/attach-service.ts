import "server-only";

import type { MediaAssetPurpose } from "@/generated/prisma/client";
import { mutateDraft } from "@/lib/portfolios/draft-mutation";

export type AttachTarget = { kind: "avatar" } | { kind: "project"; projectId: string };
export type AttachError = "INVALID_ASSET" | "PROJECT_NOT_FOUND";

const PURPOSE_FOR: Record<AttachTarget["kind"], MediaAssetPurpose> = {
  avatar: "PROFILE_AVATAR",
  project: "PROJECT_COVER",
};

/**
 * Attaches a READY asset to a profile avatar or a project cover (assetId = null
 * detaches), under the draft's optimistic concurrency. The asset must belong to
 * the same owner AND the same portfolio, be READY, non-deleted, and match the
 * target's purpose — all re-checked inside the revision-bumping transaction, so
 * there is no cross-tenant or stale attach. Published versions are untouched;
 * detaching only clears the draft reference (cleanup, not this call, decides
 * deletion, and only for assets no retained published version references).
 */
export async function attachMediaAsset(
  clerkUserId: string,
  portfolioId: string,
  expectedRevision: bigint,
  target: AttachTarget,
  assetId: string | null,
) {
  return mutateDraft<{ assetId: string | null }, AttachError>(
    clerkUserId,
    portfolioId,
    expectedRevision,
    async (tx, ownerId) => {
      if (assetId !== null) {
        const asset = await tx.mediaAsset.findFirst({
          where: {
            id: assetId,
            ownerId,
            portfolioId,
            status: "READY",
            deletedAt: null,
            purpose: PURPOSE_FOR[target.kind],
          },
          select: { id: true },
        });
        if (!asset) {
          return { ok: false, error: "INVALID_ASSET" };
        }
      }

      if (target.kind === "avatar") {
        await tx.portfolioProfile.upsert({
          where: { portfolioId },
          create: { portfolioId, displayName: "", avatarAssetId: assetId },
          update: { avatarAssetId: assetId },
        });
      } else {
        const updated = await tx.project.updateMany({
          where: { id: target.projectId, portfolioId },
          data: { coverAssetId: assetId },
        });
        if (updated.count === 0) {
          return { ok: false, error: "PROJECT_NOT_FOUND" };
        }
      }

      return { ok: true, value: { assetId } };
    },
  );
}
