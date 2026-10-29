import type { MediaAssetStatus } from "@/generated/prisma/client";

/**
 * Upload lifecycle state machine.
 *
 *   PENDING ──▶ READY     (server verified the stored bytes)
 *   PENDING ──▶ FAILED    (verification failed / upload abandoned)
 *   PENDING ──▶ DELETING  (cancelled before verification)
 *   READY   ──▶ DELETING  (replaced or removed)
 *   FAILED  ──▶ DELETING  (cleanup)
 *
 * DELETING is terminal (the row is removed once the object is gone). An asset is
 * never moved back to PENDING, and never to READY except from PENDING — so the
 * browser reporting success can't, on its own, make an asset READY.
 */
const TRANSITIONS: Record<MediaAssetStatus, readonly MediaAssetStatus[]> = {
  PENDING: ["READY", "FAILED", "DELETING"],
  READY: ["DELETING"],
  FAILED: ["DELETING"],
  DELETING: [],
};

export function canTransitionMediaStatus(from: MediaAssetStatus, to: MediaAssetStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
