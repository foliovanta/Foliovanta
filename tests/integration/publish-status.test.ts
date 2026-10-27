import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PublishModule from "@/lib/publishing/publish-service";
import type * as StatusModule from "@/lib/publishing/publish-status";
import type * as VersionsModule from "@/lib/publishing/version-history";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("publish status & version history (integration)", () => {
  let publish: typeof PublishModule;
  let status: typeof StatusModule;
  let versions: typeof VersionsModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createActiveUser() {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status: "ACTIVE" },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createPublishablePortfolio(ownerId: string) {
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
    publish = await import("@/lib/publishing/publish-service");
    status = await import("@/lib/publishing/publish-status");
    versions = await import("@/lib/publishing/version-history");
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

  it("reports unpublished changes honestly via the content hash", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);

    await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));

    const published = await status.getPublishStatus(user.clerkUserId, portfolio.id);
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.status.publicationStatus).toBe("PUBLISHED");
    expect(published.status.hasUnpublishedChanges).toBe(false);

    // Change the draft content; the published snapshot now differs.
    await prisma.portfolioProfile.update({
      where: { portfolioId: portfolio.id },
      data: { displayName: "Ada L" },
    });

    const edited = await status.getPublishStatus(user.clerkUserId, portfolio.id);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.status.hasUnpublishedChanges).toBe(true);
  });

  it("paginates versions newest-first and marks the active one", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);

    // Three distinct published versions.
    for (const name of ["V1", "V2", "V3"]) {
      await prisma.portfolioProfile.update({
        where: { portfolioId: portfolio.id },
        data: { displayName: name },
      });
      const current = await prisma.portfolio.findUniqueOrThrow({
        where: { id: portfolio.id },
        select: { draftRevision: true },
      });
      await publish.publishPortfolio(user.clerkUserId, portfolio.id, current.draftRevision);
    }

    const firstPage = await versions.listPortfolioVersions(user.clerkUserId, portfolio.id, {
      limit: 2,
    });
    expect(firstPage.ok).toBe(true);
    if (!firstPage.ok) return;
    expect(firstPage.versions.map((v) => v.versionNumber)).toEqual([3, 2]);
    expect(firstPage.versions[0]?.isActive).toBe(true); // newest is active
    expect(firstPage.versions[1]?.isActive).toBe(false);
    expect(firstPage.nextCursor).toBe(2);

    const secondPage = await versions.listPortfolioVersions(user.clerkUserId, portfolio.id, {
      ...(firstPage.nextCursor !== null ? { cursor: firstPage.nextCursor } : {}),
      limit: 2,
    });
    expect(secondPage.ok).toBe(true);
    if (!secondPage.ok) return;
    expect(secondPage.versions.map((v) => v.versionNumber)).toEqual([1]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("does not leak another owner's versions", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPublishablePortfolio(owner.id);
    await publish.publishPortfolio(owner.clerkUserId, portfolio.id, BigInt(0));

    const result = await versions.listPortfolioVersions(other.clerkUserId, portfolio.id, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});
