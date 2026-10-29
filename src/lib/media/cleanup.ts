import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isAssetReferencedByPublishedVersion } from "@/lib/media/asset-service";
import { getStorageProvider } from "@/lib/media/storage";
import { stagingKeyFor } from "@/lib/media/validation";

// Abandoned PENDING uploads older than this are reclaimable.
const PENDING_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Reclaims abandoned/failed media: PENDING older than the TTL, plus FAILED and
 * DELETING. Bounded batch, idempotent, retry-safe (best-effort object deletes +
 * delete-by-id). NEVER deletes an asset still referenced by any retained
 * published version (checked before any destructive action).
 */
export async function cleanupMediaAssets(
  options: { now?: Date; limit?: number } = {},
): Promise<{ examined: number; deleted: number; skipped: number }> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;
  const storage = getStorageProvider(); // throws if unconfigured

  const candidates = await prisma.mediaAsset.findMany({
    where: {
      OR: [
        { status: "PENDING", createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) } },
        { status: { in: ["FAILED", "DELETING"] } },
      ],
    },
    select: { id: true, storageKey: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let deleted = 0;
  let skipped = 0;
  for (const asset of candidates) {
    if (await isAssetReferencedByPublishedVersion(asset.id)) {
      skipped += 1; // retained — a published version still needs it
      continue;
    }
    // Delete the objects FIRST; only drop the row if both succeeded. S3/R2
    // delete is idempotent (a missing key is not an error), so a throw here is a
    // real failure — keep the row so a later run retries, never orphaning the
    // stored object by deleting its only database reference.
    try {
      await storage.deleteObject(stagingKeyFor(asset.storageKey));
      await storage.deleteObject(asset.storageKey);
    } catch {
      skipped += 1;
      continue;
    }
    const result = await prisma.mediaAsset.deleteMany({ where: { id: asset.id } });
    deleted += result.count;
  }

  return { examined: candidates.length, deleted, skipped };
}
