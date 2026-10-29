import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

// In-memory object store standing in for R2 (real storage is unavailable in this
// environment). sharp verification + the database are REAL; only the bytes
// transport is mocked — reported as such, not as end-to-end storage.
const store = vi.hoisted(() => new Map<string, { bytes: Uint8Array; contentType: string }>());

vi.mock("@/lib/media/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media/storage")>();
  return {
    ...actual,
    getStorageProvider: () => ({
      name: "R2" as const,
      async createSignedUpload() {
        return { url: "https://fake", method: "PUT" as const, headers: {}, expiresInSeconds: 120 };
      },
      async headObject(key: string) {
        const o = store.get(key);
        return o ? { byteSize: o.bytes.byteLength, contentType: o.contentType } : null;
      },
      async getObjectBytes(key: string) {
        const o = store.get(key);
        if (!o) throw new Error("missing");
        return o.bytes;
      },
      async putObject({
        key,
        body,
        contentType,
      }: {
        key: string;
        body: Uint8Array;
        contentType: string;
      }) {
        store.set(key, { bytes: body, contentType });
      },
      async deleteObject(key: string) {
        store.delete(key);
      },
    }),
  };
});

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 20, g: 60, b: 100 } } })
    .png()
    .toBuffer();

describe.skipIf(!optedIn)("media pipeline (integration; storage mocked, sharp+DB real)", () => {
  let media: typeof import("@/lib/media/asset-service");
  let upload: typeof import("@/lib/media/upload-service");
  let attachMod: typeof import("@/lib/media/attach-service");
  let delivery: typeof import("@/lib/media/delivery");
  let cleanup: typeof import("@/lib/media/cleanup");
  let validation: typeof import("@/lib/media/validation");
  let publish: typeof import("@/lib/publishing/publish-service");
  let prisma: typeof import("@/lib/db/prisma").prisma;
  const createdUserIds: string[] = [];

  async function createUser() {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status: "ACTIVE" },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    return user;
  }
  async function createPortfolio(ownerId: string) {
    const portfolio = await prisma.portfolio.create({
      data: { ownerId, slug: `test-${randomUUID().slice(0, 12)}` },
      select: { id: true },
    });
    await prisma.portfolioProfile.create({
      data: { portfolioId: portfolio.id, displayName: "Ada Lovelace" },
    });
    return portfolio;
  }
  // Create a PENDING asset and seed its staging object with a real image.
  async function pendingWithUpload(
    user: { clerkUserId: string },
    portfolioId: string,
    purpose: "PROFILE_AVATAR" | "PROJECT_COVER",
    bytes: Uint8Array,
  ) {
    const created = await media.createPendingAsset(user.clerkUserId, {
      portfolioId,
      purpose,
      contentType: "image/png",
      byteSize: bytes.byteLength,
    });
    if (!created.ok) throw new Error(`setup failed: ${created.error}`);
    store.set(validation.stagingKeyFor(created.asset.storageKey), {
      bytes,
      contentType: "image/png",
    });
    return created.asset;
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    media = await import("@/lib/media/asset-service");
    upload = await import("@/lib/media/upload-service");
    attachMod = await import("@/lib/media/attach-service");
    delivery = await import("@/lib/media/delivery");
    cleanup = await import("@/lib/media/cleanup");
    validation = await import("@/lib/media/validation");
    publish = await import("@/lib/publishing/publish-service");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    if (!prisma) return;
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

  it("completes an upload only after server verification, storing normalized output", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const asset = await pendingWithUpload(user, portfolio.id, "PROJECT_COVER", await png(400, 300));

    const result = await upload.completeUpload(user.clerkUserId, asset.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("READY");
      expect(result.width).toBe(400);
    }
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row.status).toBe("READY");
    expect(row.width).toBe(400);
    expect(store.has(asset.storageKey)).toBe(true); // normalized object stored at the verified key
    expect(store.has(validation.stagingKeyFor(asset.storageKey))).toBe(false); // staging cleaned up
  });

  it("is idempotent after success", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const asset = await pendingWithUpload(user, portfolio.id, "PROJECT_COVER", await png(200, 200));
    expect((await upload.completeUpload(user.clerkUserId, asset.id)).ok).toBe(true);
    // Staging is gone now; a retry must still succeed via the early READY return.
    expect((await upload.completeUpload(user.clerkUserId, asset.id)).ok).toBe(true);
  });

  it("fails verification for non-image bytes and marks the asset FAILED", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const asset = await pendingWithUpload(
      user,
      portfolio.id,
      "PROJECT_COVER",
      Buffer.from(
        "not an image at all, just plain text bytes repeated to clear the size floor ".repeat(2),
      ),
    );
    const result = await upload.completeUpload(user.clerkUserId, asset.id);
    expect(result.ok).toBe(false);
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row.status).toBe("FAILED");
  });

  it("attaches only a READY, same-purpose, same-owner asset", async () => {
    const user = await createUser();
    const other = await createUser();
    const portfolio = await createPortfolio(user.id);
    const avatar = await pendingWithUpload(
      user,
      portfolio.id,
      "PROFILE_AVATAR",
      await png(256, 256),
    );
    await upload.completeUpload(user.clerkUserId, avatar.id);

    // Wrong purpose for the target → rejected.
    const cover = await pendingWithUpload(user, portfolio.id, "PROJECT_COVER", await png(300, 200));
    await upload.completeUpload(user.clerkUserId, cover.id);
    expect(
      await attachMod.attachMediaAsset(
        user.clerkUserId,
        portfolio.id,
        BigInt(0),
        { kind: "avatar" },
        cover.id,
      ),
    ).toMatchObject({ ok: false, error: "INVALID_ASSET" });

    // Correct attach bumps the revision.
    const ok = await attachMod.attachMediaAsset(
      user.clerkUserId,
      portfolio.id,
      BigInt(0),
      { kind: "avatar" },
      avatar.id,
    );
    expect(ok.ok).toBe(true);

    // Cross-tenant attach is a NOT_FOUND (portfolio isn't theirs).
    expect(
      await attachMod.attachMediaAsset(
        other.clerkUserId,
        portfolio.id,
        BigInt(1),
        { kind: "avatar" },
        avatar.id,
      ),
    ).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("authorizes delivery: owner always, anon only when the active published snapshot references it", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const avatar = await pendingWithUpload(
      user,
      portfolio.id,
      "PROFILE_AVATAR",
      await png(256, 256),
    );
    await upload.completeUpload(user.clerkUserId, avatar.id);
    const rev = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { draftRevision: true },
    });
    await attachMod.attachMediaAsset(
      user.clerkUserId,
      portfolio.id,
      rev.draftRevision,
      { kind: "avatar" },
      avatar.id,
    );

    // Draft only: owner may view, anonymous may not.
    expect(await delivery.resolveMediaAccess(avatar.id, user.clerkUserId)).toMatchObject({
      visibility: "private",
    });
    expect(await delivery.resolveMediaAccess(avatar.id, null)).toBeNull();

    // After publishing, the active snapshot references it → public.
    const draftRev = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { draftRevision: true },
    });
    expect(
      (await publish.publishPortfolio(user.clerkUserId, portfolio.id, draftRev.draftRevision)).ok,
    ).toBe(true);
    expect(await delivery.resolveMediaAccess(avatar.id, null)).toMatchObject({
      visibility: "public",
    });

    // After unpublish, anonymous access is revoked again.
    await publish.unpublishPortfolio(user.clerkUserId, portfolio.id);
    expect(await delivery.resolveMediaAccess(avatar.id, null)).toBeNull();
  });

  it("attaches a project cover only to its own project (no cross-project bleed)", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const projectA = await prisma.project.create({
      data: { portfolioId: portfolio.id, title: "A", position: 0 },
      select: { id: true },
    });
    const projectB = await prisma.project.create({
      data: { portfolioId: portfolio.id, title: "B", position: 1 },
      select: { id: true },
    });
    const cover = await pendingWithUpload(user, portfolio.id, "PROJECT_COVER", await png(320, 180));
    await upload.completeUpload(user.clerkUserId, cover.id);

    const rev = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { draftRevision: true },
    });
    const result = await attachMod.attachMediaAsset(
      user.clerkUserId,
      portfolio.id,
      rev.draftRevision,
      { kind: "project", projectId: projectA.id },
      cover.id,
    );
    expect(result.ok).toBe(true);

    const a = await prisma.project.findUniqueOrThrow({
      where: { id: projectA.id },
      select: { coverAssetId: true },
    });
    const b = await prisma.project.findUniqueOrThrow({
      where: { id: projectB.id },
      select: { coverAssetId: true },
    });
    expect(a.coverAssetId).toBe(cover.id);
    expect(b.coverAssetId).toBeNull();
  });

  it("revokes public delivery on moderation suspension and account deactivation", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const avatar = await pendingWithUpload(
      user,
      portfolio.id,
      "PROFILE_AVATAR",
      await png(256, 256),
    );
    await upload.completeUpload(user.clerkUserId, avatar.id);
    const rev = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { draftRevision: true },
    });
    await attachMod.attachMediaAsset(
      user.clerkUserId,
      portfolio.id,
      rev.draftRevision,
      { kind: "avatar" },
      avatar.id,
    );
    const draftRev = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { draftRevision: true },
    });
    await publish.publishPortfolio(user.clerkUserId, portfolio.id, draftRev.draftRevision);
    expect(await delivery.resolveMediaAccess(avatar.id, null)).toMatchObject({
      visibility: "public",
    });

    // Moderation suspension hides it from the public; the owner can still view it.
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { moderationStatus: "SUSPENDED" },
    });
    expect(await delivery.resolveMediaAccess(avatar.id, null)).toBeNull();
    expect(await delivery.resolveMediaAccess(avatar.id, user.clerkUserId)).toMatchObject({
      visibility: "private",
    });
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { moderationStatus: "CLEAR" },
    });

    // A deactivated owner account revokes both public and owner access.
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    expect(await delivery.resolveMediaAccess(avatar.id, null)).toBeNull();
    expect(await delivery.resolveMediaAccess(avatar.id, user.clerkUserId)).toBeNull();
  });

  it("cleanup removes abandoned PENDING but retains anything a published version references", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);

    // Abandoned PENDING (backdated) → reclaimed.
    const abandoned = await pendingWithUpload(
      user,
      portfolio.id,
      "PROJECT_COVER",
      await png(100, 100),
    );
    await prisma.mediaAsset.update({
      where: { id: abandoned.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    // A referenced asset later marked DELETING must be retained by cleanup.
    const referenced = await pendingWithUpload(
      user,
      portfolio.id,
      "PROFILE_AVATAR",
      await png(256, 256),
    );
    await upload.completeUpload(user.clerkUserId, referenced.id);
    const rev = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { draftRevision: true },
    });
    await attachMod.attachMediaAsset(
      user.clerkUserId,
      portfolio.id,
      rev.draftRevision,
      { kind: "avatar" },
      referenced.id,
    );
    const draftRev = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { draftRevision: true },
    });
    await publish.publishPortfolio(user.clerkUserId, portfolio.id, draftRev.draftRevision);
    await prisma.mediaAsset.update({ where: { id: referenced.id }, data: { status: "DELETING" } });

    const result = await cleanup.cleanupMediaAssets({ limit: 100 });
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(await prisma.mediaAsset.findUnique({ where: { id: abandoned.id } })).toBeNull();
    expect(await prisma.mediaAsset.findUnique({ where: { id: referenced.id } })).not.toBeNull();
  });
});
