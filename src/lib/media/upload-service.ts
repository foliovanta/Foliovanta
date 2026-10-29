import "server-only";

import {
  type CreatePendingAssetError,
  type CreatePendingAssetInput,
  createPendingAsset,
  getOwnedAsset,
  transitionAsset,
} from "@/lib/media/asset-service";
import { MAX_UPLOAD_BYTES } from "@/lib/media/constants";
import { type SignedUpload, getStorageProvider } from "@/lib/media/storage";
import { stagingKeyFor } from "@/lib/media/validation";
import { type VerifyFailure, verifyAndNormalizeImage } from "@/lib/media/verify";

export type InitiateUploadResult =
  | { ok: true; assetId: string; upload: SignedUpload }
  | { ok: false; error: CreatePendingAssetError };

/**
 * Creates a PENDING asset and returns a short-lived presigned PUT to its staging
 * key. Storage configuration is checked first so a missing provider fails before
 * any row is written (it throws StorageNotConfiguredError for the route to map).
 */
export async function initiateUpload(
  clerkUserId: string,
  input: CreatePendingAssetInput,
): Promise<InitiateUploadResult> {
  const storage = getStorageProvider(); // throws if unconfigured

  const created = await createPendingAsset(clerkUserId, input);
  if (!created.ok) {
    return created;
  }

  const upload = await storage.createSignedUpload({
    key: stagingKeyFor(created.asset.storageKey),
    contentType: input.contentType,
    maxBytes: input.byteSize,
  });

  return { ok: true, assetId: created.asset.id, upload };
}

export type CompleteUploadError =
  | "USER_NOT_SYNCED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_UNAVAILABLE"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "UPLOAD_MISSING"
  | "TOO_LARGE"
  | { verification: VerifyFailure };

export type CompleteUploadResult =
  | { ok: true; status: "READY"; width: number; height: number; contentType: string }
  | { ok: false; error: CompleteUploadError };

/**
 * Server-authoritative completion. Reads the staging object, verifies + normalizes
 * it, writes the normalized bytes to the (never-presigned) verified key, and only
 * then marks the asset READY. Idempotent: a retry after success returns the
 * existing READY metadata without reprocessing; concurrent completions resolve
 * through the status-guarded READY transition (the loser sees the asset already
 * READY). The verified key is written solely by the server, so an untrusted
 * upload can never overwrite the READY object.
 */
export async function completeUpload(
  clerkUserId: string,
  assetId: string,
): Promise<CompleteUploadResult> {
  const owned = await getOwnedAsset(clerkUserId, assetId);
  if (!owned.ok) {
    return owned;
  }
  const asset = owned.asset;

  if (asset.status === "READY") {
    return {
      ok: true,
      status: "READY",
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      contentType: asset.contentType ?? "",
    };
  }
  if (asset.status !== "PENDING") {
    return { ok: false, error: "INVALID_STATE" };
  }

  const storage = getStorageProvider();
  const staging = stagingKeyFor(asset.storageKey);

  const head = await storage.headObject(staging);
  if (!head) {
    return { ok: false, error: "UPLOAD_MISSING" };
  }
  if (head.byteSize > MAX_UPLOAD_BYTES) {
    await transitionAsset(clerkUserId, assetId, "FAILED");
    await storage.deleteObject(staging).catch(() => {});
    return { ok: false, error: "TOO_LARGE" };
  }

  const bytes = await storage.getObjectBytes(staging);
  const verified = await verifyAndNormalizeImage(bytes);
  if (!verified.ok) {
    await transitionAsset(clerkUserId, assetId, "FAILED");
    await storage.deleteObject(staging).catch(() => {});
    return { ok: false, error: { verification: verified.reason } };
  }

  // Normalized bytes go to the verified key before the READY flip, so READY
  // always points at a verified object.
  await storage.putObject({
    key: asset.storageKey,
    body: verified.image.bytes,
    contentType: verified.image.contentType,
  });

  const ready = await transitionAsset(clerkUserId, assetId, "READY", {
    contentType: verified.image.contentType,
    byteSize: verified.image.byteSize,
    width: verified.image.width,
    height: verified.image.height,
  });
  // CONFLICT means a concurrent completion already flipped it READY — success.
  if (!ready.ok && ready.error !== "CONFLICT") {
    return { ok: false, error: "INVALID_STATE" };
  }

  await storage.deleteObject(staging).catch(() => {}); // staging no longer needed

  return {
    ok: true,
    status: "READY",
    width: verified.image.width,
    height: verified.image.height,
    contentType: verified.image.contentType,
  };
}
