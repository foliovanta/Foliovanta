import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PreviewModule from "@/lib/publishing/preview";
import type * as PublicReadModule from "@/lib/publishing/public-read";
import type * as PublishModule from "@/lib/publishing/publish-service";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("rollback + historical preview (integration)", () => {
  let publish: typeof PublishModule;
  let preview: typeof PreviewModule;
  let publicRead: typeof PublicReadModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createActiveUser(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status },
      select: { id: true, clerkUserId: true, publicSlug: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createPortfolio(ownerId: string, displayName = "Ada Lovelace") {
    const portfolio = await prisma.portfolio.create({
      data: { ownerId, slug: `test-${randomUUID().slice(0, 12)}` },
      select: { id: true },
    });
    await prisma.portfolioProfile.create({ data: { portfolioId: portfolio.id, displayName } });
    return portfolio;
  }

  // Publishes v1 (headline null) then edits + publishes v2 (headline "Second").
  // Returns the portfolio id; active version is v2 afterward.
  async function publishTwoVersions(clerkUserId: string, portfolioId: string) {
    const v1 = await publish.publishPortfolio(clerkUserId, portfolioId, BigInt(0));
    if (!v1.ok) throw new Error(`v1 publish failed: ${v1.error}`);
    await prisma.portfolioProfile.update({
      where: { portfolioId },
      data: { headline: "Second" },
    });
    await prisma.portfolio.update({ where: { id: portfolioId }, data: { draftRevision: BigInt(1) } });
    const v2 = await publish.publishPortfolio(clerkUserId, portfolioId, BigInt(1));
    if (!v2.ok) throw new Error(`v2 publish failed: ${v2.error}`);
    return { v1: v1.versionNumber, v2: v2.versionNumber };
  }

  // Tamper a stored version's snapshot template version to an unsupported one —
  // the public read / preview / rollback all judge renderability from this.
  async function makeVersionUnrenderable(portfolioId: string, versionNumber: number) {
    const version = await prisma.portfolioVersion.findFirstOrThrow({
      where: { portfolioId, versionNumber },
      select: { id: true, snapshot: true },
    });
    const snapshot = version.snapshot as { portfolio: { templateVersion: string } };
    snapshot.portfolio.templateVersion = "9.9.9";
    await prisma.portfolioVersion.update({ where: { id: version.id }, data: { snapshot } });
  }

  const read = (id: string) =>
    prisma.portfolio.findUniqueOrThrow({
      where: { id },
      select: {
        publicationStatus: true,
        activeVersionId: true,
        nextVersionNumber: true,
        draftRevision: true,
      },
    });

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    publish = await import("@/lib/publishing/publish-service");
    preview = await import("@/lib/publishing/preview");
    publicRead = await import("@/lib/publishing/public-read");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      await prisma.portfolio.updateMany({
        where: { ownerId: { in: createdUserIds } },
        data: { activeVersionId: null },
      });
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("moves the active pointer to an older version and changes the public read", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const { v1, v2 } = await publishTwoVersions(user.clerkUserId, portfolio.id);

    // Live page currently shows v2 (with headline).
    const before = await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString());
    expect(before.ok && before.versionNumber).toBe(v2);

    const result = await publish.rollbackPortfolio(user.clerkUserId, portfolio.id, v1, v2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activeVersionNumber).toBe(v1);
    expect(result.changed).toBe(true);

    const after = await read(portfolio.id);
    expect(after.publicationStatus).toBe("PUBLISHED");
    expect(after.draftRevision).toBe(BigInt(1)); // draft untouched
    expect(after.nextVersionNumber).toBe(3); // no new version consumed

    // Public page immediately reflects v1 — and both snapshots still exist.
    const live = await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString());
    expect(live.ok && live.versionNumber).toBe(v1);
    expect(live.ok && live.snapshot.profile.headline).toBeNull();
    expect(await prisma.portfolioVersion.count({ where: { portfolioId: portfolio.id } })).toBe(2);
  });

  it("is an idempotent no-op when the target is already live", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const { v2 } = await publishTwoVersions(user.clerkUserId, portfolio.id);

    const result = await publish.rollbackPortfolio(user.clerkUserId, portfolio.id, v2, v2);
    expect(result.ok && result.changed).toBe(false);
    expect(result.ok && result.activeVersionNumber).toBe(v2);
  });

  it("rejects a stale expected active version (optimistic concurrency)", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const { v1, v2 } = await publishTwoVersions(user.clerkUserId, portfolio.id);

    // Client believed v1 was live, but v2 is.
    const result = await publish.rollbackPortfolio(user.clerkUserId, portfolio.id, v1, v1);
    expect(result).toEqual({ ok: false, error: "ROLLBACK_CONFLICT" });
    // Pointer unchanged.
    expect((await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString())).ok).toBe(true);
    const live = await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString());
    expect(live.ok && live.versionNumber).toBe(v2);
  });

  it("refuses to roll back an unpublished portfolio (no silent republish)", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const { v1, v2 } = await publishTwoVersions(user.clerkUserId, portfolio.id);
    await publish.unpublishPortfolio(user.clerkUserId, portfolio.id);

    const result = await publish.rollbackPortfolio(user.clerkUserId, portfolio.id, v1, v2);
    expect(result).toEqual({ ok: false, error: "NOT_PUBLISHED" });

    const after = await read(portfolio.id);
    expect(after.publicationStatus).toBe("UNPUBLISHED");
    expect(after.activeVersionId).toBeNull(); // still private
  });

  it("refuses a suspended portfolio and never bypasses moderation", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const { v1, v2 } = await publishTwoVersions(user.clerkUserId, portfolio.id);
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { moderationStatus: "SUSPENDED" },
    });

    const result = await publish.rollbackPortfolio(user.clerkUserId, portfolio.id, v1, v2);
    expect(result).toEqual({ ok: false, error: "PORTFOLIO_SUSPENDED" });
  });

  it("returns TARGET_NOT_FOUND for a version that doesn't exist", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const { v2 } = await publishTwoVersions(user.clerkUserId, portfolio.id);

    const result = await publish.rollbackPortfolio(user.clerkUserId, portfolio.id, 999, v2);
    expect(result).toEqual({ ok: false, error: "TARGET_NOT_FOUND" });
  });

  it("refuses to make an unrenderable version live", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const { v1, v2 } = await publishTwoVersions(user.clerkUserId, portfolio.id);

    await makeVersionUnrenderable(portfolio.id, v1);

    const result = await publish.rollbackPortfolio(user.clerkUserId, portfolio.id, v1, v2);
    expect(result).toEqual({ ok: false, error: "TARGET_UNRENDERABLE" });
    // Live page still shows v2 — the pointer never moved onto the broken version.
    const live = await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString());
    expect(live.ok && live.versionNumber).toBe(v2);
  });

  it("returns NOT_FOUND for a cross-owner rollback", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);
    const { v1, v2 } = await publishTwoVersions(owner.clerkUserId, portfolio.id);

    const result = await publish.rollbackPortfolio(other.clerkUserId, portfolio.id, v1, v2);
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("serializes a concurrent publish and rollback (exactly one wins the pointer)", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const { v1, v2 } = await publishTwoVersions(user.clerkUserId, portfolio.id);

    // A fresh draft edit (so publish would create v3) races a rollback to v1.
    await prisma.portfolioProfile.update({
      where: { portfolioId: portfolio.id },
      data: { headline: "Third" },
    });
    await prisma.portfolio.update({ where: { id: portfolio.id }, data: { draftRevision: BigInt(2) } });

    const [pub, roll] = await Promise.all([
      publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(2)),
      publish.rollbackPortfolio(user.clerkUserId, portfolio.id, v1, v2),
    ]);

    // Both calls complete without corruption; the row lock serialized them.
    expect(pub.ok).toBe(true);
    // Whatever order they ran, the portfolio is PUBLISHED with a single, valid
    // active version that is still publicly renderable.
    const live = await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString());
    expect(live.ok).toBe(true);
    // Rollback either won (active v1) or lost to the publish (CONFLICT, active v3).
    if (roll.ok) {
      expect(roll.activeVersionNumber).toBe(v1);
    } else {
      expect(roll.error).toBe("ROLLBACK_CONFLICT");
    }
  });

  it("previews a historical version read-only, owner-only, and reports unrenderable", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);
    const { v1, v2 } = await publishTwoVersions(owner.clerkUserId, portfolio.id);

    // Owner previews v1 — gets v1's immutable snapshot (headline null), while v2
    // remains the live active version (no mutation, no republish).
    const previewV1 = await preview.buildVersionPreview(owner.clerkUserId, portfolio.id, v1);
    expect(previewV1.ok && previewV1.snapshot.profile.headline).toBeNull();
    const previewV2 = await preview.buildVersionPreview(owner.clerkUserId, portfolio.id, v2);
    expect(previewV2.ok && previewV2.snapshot.profile.headline).toBe("Second");
    expect((await read(portfolio.id)).activeVersionId).not.toBeNull();

    // Another user can't preview it.
    expect(await preview.buildVersionPreview(other.clerkUserId, portfolio.id, v1)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });

    // A missing version → NOT_FOUND; an unsupported template → UNRENDERABLE.
    expect(await preview.buildVersionPreview(owner.clerkUserId, portfolio.id, 999)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    await makeVersionUnrenderable(portfolio.id, v1);
    expect(await preview.buildVersionPreview(owner.clerkUserId, portfolio.id, v1)).toEqual({
      ok: false,
      error: "UNRENDERABLE",
    });
  });
});
