import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

/**
 * REAL object-storage acceptance suite. Opt-in and double-gated: it runs ONLY
 * when both the DB integration opt-in is set AND real storage is configured with
 * RUN_STORAGE_INTEGRATION_TESTS=1. Otherwise it is reported as NOT RUN.
 *
 * Setup (MinIO or a dedicated scratch R2 bucket — NEVER production):
 *   1. Start MinIO (docker run -p 9000:9000 minio/minio server /data) or create
 *      an empty R2 bucket + API token.
 *   2. Export R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *      (for MinIO the adapter endpoint must point at it — see notes in the
 *      decision doc), plus RUN_STORAGE_INTEGRATION_TESTS=1 and the DB opt-in.
 *   3. Run: RUN_DB_INTEGRATION_TESTS=1 RUN_STORAGE_INTEGRATION_TESTS=1 \
 *        pnpm exec dotenv run -f .env.local -- pnpm test:integration
 *
 * It only ever deletes the exact objects/rows it created (tracked) — no
 * bucket-wide operations.
 */
const storageOptedIn = optedIn && process.env.RUN_STORAGE_INTEGRATION_TESTS === "1";

// Does the presigned PUT, and on a non-2xx surfaces the HTTP status + R2's XML
// <Code>/<Message> — never the URL, signature, headers, or credentials.
async function presignedPut(
  url: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<{ ok: boolean; status: number; code: string; message: string }> {
  const res = await fetch(url, { method: "PUT", headers, body: body as unknown as BodyInit });
  if (res.ok) return { ok: true, status: res.status, code: "", message: "" };
  const text = await res.text().catch(() => "");
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? "unknown";
  const message = /<Message>([^<]+)<\/Message>/.exec(text)?.[1] ?? text.slice(0, 200);
  return { ok: false, status: res.status, code, message };
}

describe.skipIf(!storageOptedIn)("media storage (live object storage)", () => {
  let upload: typeof import("@/lib/media/upload-service");
  let delivery: typeof import("@/lib/media/delivery");
  let storageMod: typeof import("@/lib/media/storage");
  let prisma: typeof import("@/lib/db/prisma").prisma;
  const createdUserIds: string[] = [];
  const createdKeys: string[] = [];

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    upload = await import("@/lib/media/upload-service");
    delivery = await import("@/lib/media/delivery");
    storageMod = await import("@/lib/media/storage");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    if (!prisma) return;
    const provider = storageMod.getStorageProvider();
    for (const key of createdKeys) {
      await provider.deleteObject(key).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.portfolio.updateMany({
        where: { ownerId: { in: createdUserIds } },
        data: { activeVersionId: null },
      });
      await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("round-trips a real upload: presigned PUT → verify → READY → delivery → cleanup", async () => {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status: "ACTIVE" },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    const portfolio = await prisma.portfolio.create({
      data: { ownerId: user.id, slug: `test-${randomUUID().slice(0, 12)}` },
      select: { id: true },
    });
    await prisma.portfolioProfile.create({
      data: { portfolioId: portfolio.id, displayName: "Ada" },
    });

    const image = await sharp({
      create: { width: 500, height: 400, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    // Initiate → real presigned PUT.
    const initiated = await upload.initiateUpload(user.clerkUserId, {
      portfolioId: portfolio.id,
      purpose: "PROJECT_COVER",
      contentType: "image/jpeg",
      byteSize: image.byteLength,
    });
    expect(initiated.ok).toBe(true);
    if (!initiated.ok) return;

    const asset = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: initiated.assetId },
      select: { storageKey: true },
    });
    createdKeys.push(asset.storageKey, `staging/${asset.storageKey}`);

    // Header NAMES only (never the signature/credential) aid diagnosis of a
    // signed-header mismatch; a 403 AccessDenied with a valid signature instead
    // points at the R2 token's permissions.
    const signedHeaders = new URL(initiated.upload.url).searchParams.get("X-Amz-SignedHeaders");
    const putResponse = await presignedPut(initiated.upload.url, initiated.upload.headers, image);
    expect(
      putResponse,
      `R2 PUT ${putResponse.status} ${putResponse.code}: ${putResponse.message} | signedHeaders=${signedHeaders}`,
    ).toMatchObject({ ok: true });

    // Completion verifies + normalizes the real object.
    const completed = await upload.completeUpload(user.clerkUserId, initiated.assetId);
    expect(completed.ok).toBe(true);

    // The owner can fetch it; the verified object exists.
    const access = await delivery.resolveMediaAccess(initiated.assetId, user.clerkUserId);
    expect(access?.visibility).toBe("private");
    const provider = storageMod.getStorageProvider();
    const bytes = await provider.getObjectBytes(asset.storageKey);
    expect(bytes.byteLength).toBeGreaterThan(0);

    // Staging was cleaned up.
    expect(await provider.headObject(`staging/${asset.storageKey}`)).toBeNull();
  });

  it("rejects a staging object that is not a valid image", async () => {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status: "ACTIVE" },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    const portfolio = await prisma.portfolio.create({
      data: { ownerId: user.id, slug: `test-${randomUUID().slice(0, 12)}` },
      select: { id: true },
    });
    await prisma.portfolioProfile.create({
      data: { portfolioId: portfolio.id, displayName: "Ada" },
    });

    const garbage = Buffer.from("x".repeat(256));
    const initiated = await upload.initiateUpload(user.clerkUserId, {
      portfolioId: portfolio.id,
      purpose: "PROJECT_COVER",
      contentType: "image/jpeg",
      byteSize: garbage.byteLength,
    });
    expect(initiated.ok).toBe(true);
    if (!initiated.ok) return;
    const asset = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: initiated.assetId },
      select: { storageKey: true },
    });
    createdKeys.push(asset.storageKey, `staging/${asset.storageKey}`);

    const put = await presignedPut(initiated.upload.url, initiated.upload.headers, garbage);
    expect(put, `R2 PUT ${put.status} ${put.code}: ${put.message}`).toMatchObject({ ok: true });

    // The upload succeeded, but server verification must reject non-image bytes.
    const completed = await upload.completeUpload(user.clerkUserId, initiated.assetId);
    expect(completed.ok).toBe(false);
  });
});
