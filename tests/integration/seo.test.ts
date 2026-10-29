import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PublicReadModule from "@/lib/publishing/public-read";
import type * as PublishModule from "@/lib/publishing/publish-service";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("SEO visibility (integration)", () => {
  let publicRead: typeof PublicReadModule;
  let publish: typeof PublishModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createUser() {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status: "ACTIVE" },
      select: { id: true, clerkUserId: true, publicSlug: true },
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
  async function publishPortfolio(clerkUserId: string, portfolioId: string) {
    const r = await publish.publishPortfolio(clerkUserId, portfolioId, BigInt(0));
    if (!r.ok) throw new Error(`publish failed: ${r.error}`);
    return r;
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    publicRead = await import("@/lib/publishing/public-read");
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
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("lists only currently public portfolios in the sitemap source", async () => {
    const pub = await createUser();
    const draft = await createUser();
    const suspended = await createUser();
    const deleted = await createUser();
    const inactive = await createUser();

    const pubP = await createPortfolio(pub.id);
    await publishPortfolio(pub.clerkUserId, pubP.id);
    await createPortfolio(draft.id); // never published

    const suspendedP = await createPortfolio(suspended.id);
    await publishPortfolio(suspended.clerkUserId, suspendedP.id);
    await prisma.portfolio.update({
      where: { id: suspendedP.id },
      data: { moderationStatus: "SUSPENDED" },
    });

    const deletedP = await createPortfolio(deleted.id);
    await publishPortfolio(deleted.clerkUserId, deletedP.id);
    await prisma.portfolio.update({ where: { id: deletedP.id }, data: { deletedAt: new Date() } });

    const inactiveP = await createPortfolio(inactive.id);
    await publishPortfolio(inactive.clerkUserId, inactiveP.id);
    await prisma.user.update({ where: { id: inactive.id }, data: { status: "SUSPENDED" } });

    const slugs = (await publicRead.listIndexablePortfolios()).map((p) => p.publicSlug);
    expect(slugs).toContain(pub.publicSlug.toString());
    expect(slugs).not.toContain(draft.publicSlug.toString());
    expect(slugs).not.toContain(suspended.publicSlug.toString());
    expect(slugs).not.toContain(deleted.publicSlug.toString());
    expect(slugs).not.toContain(inactive.publicSlug.toString());
  });

  it("hides a portfolio whose published template version is unsupported (no blank 200)", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    await publishPortfolio(user.clerkUserId, portfolio.id);

    // Sanity: renderable now.
    expect((await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString())).ok).toBe(
      true,
    );

    // Tamper the active version's snapshot to an unsupported template version.
    const version = await prisma.portfolioVersion.findFirstOrThrow({
      where: { portfolioId: portfolio.id, versionNumber: 1 },
      select: { id: true, snapshot: true },
    });
    const snapshot = version.snapshot as { portfolio: { templateVersion: string } };
    snapshot.portfolio.templateVersion = "9.9.9";
    await prisma.portfolioVersion.update({ where: { id: version.id }, data: { snapshot } });

    const result = await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString());
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
