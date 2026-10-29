import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as AssetModule from "@/lib/media/asset-service";
import type * as PublishModule from "@/lib/publishing/publish-service";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

const JPEG = { contentType: "image/jpeg", byteSize: 2048 };

describe.skipIf(!optedIn)("media assets (integration)", () => {
  let assets: typeof AssetModule;
  let publish: typeof PublishModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createUser(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status },
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

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    assets = await import("@/lib/media/asset-service");
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

  it("creates a PENDING asset with an opaque key for the owner", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const result = await assets.createPendingAsset(user.clerkUserId, {
      portfolioId: portfolio.id,
      purpose: "PROFILE_AVATAR",
      ...JPEG,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.asset.status).toBe("PENDING");
      expect(result.asset.storageKey).toMatch(/^assets\/profile_avatar\//);
    }
  });

  it("rejects invalid type/size, a non-owned portfolio, and a suspended account", async () => {
    const user = await createUser();
    const other = await createUser();
    const suspended = await createUser("SUSPENDED");
    const portfolio = await createPortfolio(user.id);

    expect(
      await assets.createPendingAsset(user.clerkUserId, {
        portfolioId: portfolio.id,
        purpose: "PROJECT_COVER",
        contentType: "image/svg+xml",
        byteSize: 2048,
      }),
    ).toEqual({ ok: false, error: "INVALID_TYPE" });

    expect(
      await assets.createPendingAsset(user.clerkUserId, {
        portfolioId: portfolio.id,
        purpose: "PROJECT_COVER",
        contentType: "image/png",
        byteSize: 50 * 1024 * 1024,
      }),
    ).toEqual({ ok: false, error: "INVALID_SIZE" });

    expect(
      await assets.createPendingAsset(other.clerkUserId, {
        portfolioId: portfolio.id,
        purpose: "PROFILE_AVATAR",
        ...JPEG,
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });

    expect(
      await assets.createPendingAsset(suspended.clerkUserId, {
        portfolioId: portfolio.id,
        purpose: "PROFILE_AVATAR",
        ...JPEG,
      }),
    ).toEqual({ ok: false, error: "ACCOUNT_SUSPENDED" });
  });

  it("enforces the per-purpose quota, including under concurrency", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const make = () =>
      assets.createPendingAsset(user.clerkUserId, {
        portfolioId: portfolio.id,
        purpose: "PROFILE_AVATAR",
        ...JPEG,
      });

    const [a, b] = await Promise.all([make(), make()]);
    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.error)).sort();
    expect(outcomes).toEqual(["QUOTA_EXCEEDED", "ok"]); // only one avatar slot
  });

  it("applies the lifecycle rules: READY sets metadata, illegal moves rejected, retries idempotent", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const created = await assets.createPendingAsset(user.clerkUserId, {
      portfolioId: portfolio.id,
      purpose: "PROJECT_COVER",
      ...JPEG,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.asset.id;

    const ready = await assets.transitionAsset(user.clerkUserId, id, "READY", {
      contentType: "image/jpeg",
      byteSize: 2048,
      width: 1200,
      height: 800,
    });
    expect(ready).toEqual({ ok: true, status: "READY" });

    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("READY");
    expect(row.width).toBe(1200);
    expect(row.readyAt).not.toBeNull();

    // Retry is idempotent; resurrection is rejected.
    expect(await assets.transitionAsset(user.clerkUserId, id, "READY")).toEqual({
      ok: true,
      status: "READY",
    });
    expect(await assets.transitionAsset(user.clerkUserId, id, "FAILED")).toEqual({
      ok: false,
      error: "INVALID_TRANSITION",
    });

    // DELETING is allowed from READY.
    expect(await assets.transitionAsset(user.clerkUserId, id, "DELETING")).toEqual({
      ok: true,
      status: "DELETING",
    });
  });

  it("isolates assets across owners", async () => {
    const owner = await createUser();
    const other = await createUser();
    const portfolio = await createPortfolio(owner.id);
    const created = await assets.createPendingAsset(owner.clerkUserId, {
      portfolioId: portfolio.id,
      purpose: "PROJECT_COVER",
      ...JPEG,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await assets.getOwnedAsset(other.clerkUserId, created.asset.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(await assets.transitionAsset(other.clerkUserId, created.asset.id, "READY")).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("detects assets referenced by a published version", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const created = await assets.createPendingAsset(user.clerkUserId, {
      portfolioId: portfolio.id,
      purpose: "PROFILE_AVATAR",
      ...JPEG,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Attach the asset to the draft profile, then publish so the snapshot embeds it.
    await prisma.portfolioProfile.update({
      where: { portfolioId: portfolio.id },
      data: { avatarAssetId: created.asset.id },
    });
    const published = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(published.ok).toBe(true);

    expect(await assets.isAssetReferencedByPublishedVersion(created.asset.id)).toBe(true);
    expect(await assets.isAssetReferencedByPublishedVersion(randomUUID())).toBe(false);
  });
});
