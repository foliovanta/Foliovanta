import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PublishModule from "@/lib/publishing/publish-service";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("publishing (integration)", () => {
  let publish: typeof PublishModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createActiveUser(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  // A publishable portfolio: has a profile display name.
  async function createPublishablePortfolio(
    ownerId: string,
    opts: { deletedAt?: Date; moderation?: "CLEAR" | "SUSPENDED"; displayName?: string } = {},
  ) {
    const portfolio = await prisma.portfolio.create({
      data: {
        ownerId,
        slug: `test-${randomUUID().slice(0, 12)}`,
        ...(opts.deletedAt ? { deletedAt: opts.deletedAt } : {}),
        ...(opts.moderation ? { moderationStatus: opts.moderation } : {}),
      },
      select: { id: true, draftRevision: true, nextVersionNumber: true },
    });
    await prisma.portfolioProfile.create({
      data: { portfolioId: portfolio.id, displayName: opts.displayName ?? "Ada Lovelace" },
    });
    return portfolio;
  }

  const read = (id: string) =>
    prisma.portfolio.findUniqueOrThrow({
      where: { id },
      select: {
        publicationStatus: true,
        activeVersionId: true,
        nextVersionNumber: true,
        draftRevision: true,
        publishedAt: true,
      },
    });

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    publish = await import("@/lib/publishing/publish-service");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      // Clear active pointers first so portfolios can be deleted (versions cascade).
      await prisma.portfolio.updateMany({
        where: { ownerId: { in: createdUserIds } },
        data: { activeVersionId: null },
      });
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("publishes a first immutable version and sets the active pointer", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);

    const result = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.versionNumber).toBe(1);
    expect(result.created).toBe(true);

    const after = await read(portfolio.id);
    expect(after.publicationStatus).toBe("PUBLISHED");
    expect(after.nextVersionNumber).toBe(2);
    expect(after.draftRevision).toBe(BigInt(0)); // publishing never bumps the draft revision
    expect(after.publishedAt).not.toBeNull();

    const version = await prisma.portfolioVersion.findFirstOrThrow({
      where: { portfolioId: portfolio.id, versionNumber: 1 },
      select: { id: true, snapshot: true, contentHash: true, sourceDraftRevision: true },
    });
    expect(after.activeVersionId).toBe(version.id);
    expect(version.sourceDraftRevision).toBe(BigInt(0));
    // No private fields leaked into the snapshot.
    const json = JSON.stringify(version.snapshot);
    expect(json).not.toContain(user.id);
    expect(json).not.toContain("ownerId");
    expect(json).toContain("Ada Lovelace");
  });

  it("is an idempotent no-op when content is unchanged", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    const first = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    const again = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) {
      expect(again.created).toBe(false);
      expect(again.versionNumber).toBe(first.versionNumber);
      expect(again.contentHash).toBe(first.contentHash);
    }
    const after = await read(portfolio.id);
    expect(after.nextVersionNumber).toBe(2); // not advanced by the no-op
  });

  it("creates a new version after a draft change and preserves history", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));

    // Simulate a draft edit: change content + bump draftRevision.
    await prisma.portfolioProfile.update({
      where: { portfolioId: portfolio.id },
      data: { headline: "Mathematician" },
    });
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { draftRevision: BigInt(1) },
    });

    const second = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(1));
    expect(second.ok && second.versionNumber).toBe(2);
    expect(second.ok && second.created).toBe(true);
    const versions = await prisma.portfolioVersion.count({ where: { portfolioId: portfolio.id } });
    expect(versions).toBe(2); // history preserved
  });

  it("rejects a stale revision with no writes", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: { draftRevision: BigInt(3) },
    });

    const result = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(result).toEqual({ ok: false, error: "REVISION_CONFLICT" });
    const after = await read(portfolio.id);
    expect(after.publicationStatus).toBe("DRAFT");
    expect(after.nextVersionNumber).toBe(1); // no version number consumed
  });

  it("fails readiness with zero writes when there is no display name", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id, { displayName: "" });
    const result = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "NOT_READY") {
      expect(result.issues.some((i) => i.field === "profile.displayName")).toBe(true);
    } else {
      throw new Error(`expected NOT_READY, got ${JSON.stringify(result)}`);
    }
    const after = await read(portfolio.id);
    expect(after.publicationStatus).toBe("DRAFT");
    expect(after.nextVersionNumber).toBe(1);
    expect(await prisma.portfolioVersion.count({ where: { portfolioId: portfolio.id } })).toBe(0);
  });

  it("lets only one of two concurrent same-revision publishes create a version", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    const [a, b] = await Promise.all([
      publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0)),
      publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0)),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const created = [a, b].filter((r) => r.ok && r.created).length;
    expect(created).toBe(1);
    expect(await prisma.portfolioVersion.count({ where: { portfolioId: portfolio.id } })).toBe(1);
    expect((await read(portfolio.id)).nextVersionNumber).toBe(2);
  });

  it("rejects suspended, soft-deleted, and cross-owner portfolios", async () => {
    const owner = await createActiveUser();
    const suspended = await createPublishablePortfolio(owner.id, { moderation: "SUSPENDED" });
    expect(await publish.publishPortfolio(owner.clerkUserId, suspended.id, BigInt(0))).toEqual({
      ok: false,
      error: "PORTFOLIO_SUSPENDED",
    });

    const deleted = await createPublishablePortfolio(owner.id, { deletedAt: new Date() });
    expect(await publish.publishPortfolio(owner.clerkUserId, deleted.id, BigInt(0))).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });

    const other = await createActiveUser();
    const owned = await createPublishablePortfolio(owner.id);
    expect(await publish.publishPortfolio(other.clerkUserId, owned.id, BigInt(0))).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("unpublishes, is idempotent, preserves history, and can republish", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));

    const un1 = await publish.unpublishPortfolio(user.clerkUserId, portfolio.id);
    expect(un1).toEqual({ ok: true, publicationStatus: "UNPUBLISHED", revision: BigInt(0) });
    const afterUnpublish = await read(portfolio.id);
    expect(afterUnpublish.publicationStatus).toBe("UNPUBLISHED");
    expect(afterUnpublish.activeVersionId).toBeNull();
    // History preserved.
    expect(await prisma.portfolioVersion.count({ where: { portfolioId: portfolio.id } })).toBe(1);

    // Repeated unpublish is a no-op.
    const un2 = await publish.unpublishPortfolio(user.clerkUserId, portfolio.id);
    expect(un2).toEqual({ ok: true, publicationStatus: "UNPUBLISHED", revision: BigInt(0) });

    // Republish after unpublish re-activates.
    const re = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(re.ok).toBe(true);
    const afterRepublish = await read(portfolio.id);
    expect(afterRepublish.publicationStatus).toBe("PUBLISHED");
    expect(afterRepublish.activeVersionId).not.toBeNull();
    expect(afterRepublish.draftRevision).toBe(BigInt(0));
  });

  it("returns NOT_FOUND when unpublishing an unowned portfolio", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPublishablePortfolio(owner.id);
    expect(await publish.unpublishPortfolio(other.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});
