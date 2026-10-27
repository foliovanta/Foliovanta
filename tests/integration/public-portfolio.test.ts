import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PublishModule from "@/lib/publishing/publish-service";
import type * as PublicReadModule from "@/lib/publishing/public-read";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("public portfolio read (integration)", () => {
  let publish: typeof PublishModule;
  let publicRead: typeof PublicReadModule;
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

  async function publishedPortfolio(ownerId: string, displayName = "Ada Lovelace") {
    const slug = `test-${randomUUID().slice(0, 12)}`;
    const portfolio = await prisma.portfolio.create({
      data: { ownerId, slug },
      select: { id: true },
    });
    await prisma.portfolioProfile.create({
      data: { portfolioId: portfolio.id, displayName },
    });
    return { id: portfolio.id, slug };
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    publish = await import("@/lib/publishing/publish-service");
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

  it("serves a published portfolio anonymously, matching the active version", async () => {
    const user = await createActiveUser();
    const p = await publishedPortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, p.id, BigInt(0));

    const result = await publicRead.getPublicPortfolio(p.slug);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.versionNumber).toBe(1);
    expect(result.snapshot.profile.displayName).toBe("Ada Lovelace");

    const version = await prisma.portfolioVersion.findFirstOrThrow({
      where: { portfolioId: p.id, versionNumber: 1 },
      select: { snapshot: true },
    });
    expect(result.snapshot).toEqual(version.snapshot);
    // No private fields.
    const json = JSON.stringify(result.snapshot);
    expect(json).not.toContain(user.id);
    expect(json).not.toContain("ownerId");
  });

  it("is unaffected by draft edits and updates atomically on republish", async () => {
    const user = await createActiveUser();
    const p = await publishedPortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, p.id, BigInt(0));

    // Draft edit without republishing: public response must not change.
    await prisma.portfolioProfile.update({
      where: { portfolioId: p.id },
      data: { headline: "Draft only" },
    });
    const stillV1 = await publicRead.getPublicPortfolio(p.slug);
    expect(stillV1.ok && stillV1.snapshot.profile.headline).toBeNull();
    expect(stillV1.ok && stillV1.versionNumber).toBe(1);

    // Republish: public response flips to v2.
    await prisma.portfolio.update({ where: { id: p.id }, data: { draftRevision: BigInt(1) } });
    await publish.publishPortfolio(user.clerkUserId, p.id, BigInt(1));
    const v2 = await publicRead.getPublicPortfolio(p.slug);
    expect(v2.ok && v2.versionNumber).toBe(2);
    expect(v2.ok && v2.snapshot.profile.headline).toBe("Draft only");
  });

  it("hides unpublished, suspended, soft-deleted, and ineligible-owner portfolios", async () => {
    const user = await createActiveUser();

    const unpublished = await publishedPortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, unpublished.id, BigInt(0));
    await publish.unpublishPortfolio(user.clerkUserId, unpublished.id);
    expect(await publicRead.getPublicPortfolio(unpublished.slug)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });

    const suspended = await publishedPortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, suspended.id, BigInt(0));
    await prisma.portfolio.update({
      where: { id: suspended.id },
      data: { moderationStatus: "SUSPENDED" },
    });
    expect(await publicRead.getPublicPortfolio(suspended.slug)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });

    const deleted = await publishedPortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, deleted.id, BigInt(0));
    await prisma.portfolio.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    expect(await publicRead.getPublicPortfolio(deleted.slug)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });

    // Owner suspended → their published portfolio is hidden.
    const suspendedOwner = await createActiveUser();
    const owned = await publishedPortfolio(suspendedOwner.id);
    await publish.publishPortfolio(suspendedOwner.clerkUserId, owned.id, BigInt(0));
    await prisma.user.update({ where: { id: suspendedOwner.id }, data: { status: "SUSPENDED" } });
    expect(await publicRead.getPublicPortfolio(owned.slug)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("hides a PUBLISHED portfolio with a null active version", async () => {
    const user = await createActiveUser();
    const p = await publishedPortfolio(user.id);
    // Force an inconsistent state: PUBLISHED but no active version.
    await prisma.portfolio.update({
      where: { id: p.id },
      data: { publicationStatus: "PUBLISHED", activeVersionId: null },
    });
    expect(await publicRead.getPublicPortfolio(p.slug)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("hides a portfolio with an unsupported snapshot schemaVersion", async () => {
    const user = await createActiveUser();
    const p = await publishedPortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, p.id, BigInt(0));
    await prisma.portfolioVersion.updateMany({
      where: { portfolioId: p.id },
      data: { schemaVersion: 999 },
    });
    expect(await publicRead.getPublicPortfolio(p.slug)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("returns NOT_FOUND for nonexistent, reserved, and invalid slugs", async () => {
    expect(await publicRead.getPublicPortfolio(randomUUID())).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(await publicRead.getPublicPortfolio("admin")).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await publicRead.getPublicPortfolio("!!!")).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
