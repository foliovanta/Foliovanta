import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PublishModule from "@/lib/publishing/publish-service";
import type * as PublicReadModule from "@/lib/publishing/public-read";
import type * as UsernameModule from "@/lib/portfolios/update-username";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("user public identity (integration)", () => {
  let publish: typeof PublishModule;
  let publicRead: typeof PublicReadModule;
  let usernames: typeof UsernameModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createUser() {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status: "ACTIVE" },
      select: { id: true, clerkUserId: true, publicSlug: true, username: true },
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
    publicRead = await import("@/lib/publishing/public-read");
    usernames = await import("@/lib/portfolios/update-username");
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

  it("allocates a unique numeric publicSlug (>= 10000) per user", async () => {
    const a = await createUser();
    const b = await createUser();
    expect(typeof a.publicSlug).toBe("bigint");
    expect(a.publicSlug).not.toEqual(b.publicSlug);
    expect(a.publicSlug >= BigInt(10000)).toBe(true);
    expect(b.publicSlug >= BigInt(10000)).toBe(true);
  });

  it("rejects any attempt to change an assigned publicSlug (DB-enforced immutability)", async () => {
    const user = await createUser();
    await expect(
      prisma.user.update({
        where: { id: user.id },
        data: { publicSlug: user.publicSlug + BigInt(1) },
      }),
    ).rejects.toThrow();
  });

  it("allows duplicate usernames across different users", async () => {
    const a = await createUser();
    const b = await createUser();
    await prisma.user.update({ where: { id: a.id }, data: { username: "same-handle" } });
    await prisma.user.update({ where: { id: b.id }, data: { username: "same-handle" } });
    const rows = await prisma.user.findMany({
      where: { id: { in: [a.id, b.id] } },
      select: { username: true },
    });
    expect(rows.filter((r) => r.username === "same-handle")).toHaveLength(2);
  });

  it("resolves a published portfolio by the owner's publicSlug, returning the live username", async () => {
    const user = await createUser();
    const portfolio = await createPublishablePortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));

    const res = await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.publicSlug).toBe(user.publicSlug.toString());
    expect(res.username).toBe(user.username);
  });

  it("hides unpublished portfolios and junk slugs uniformly", async () => {
    const user = await createUser();
    await createPublishablePortfolio(user.id); // draft, never published

    expect((await publicRead.getPublicPortfolioByUserSlug(user.publicSlug.toString())).ok).toBe(
      false,
    );
    expect((await publicRead.getPublicPortfolioByUserSlug("abc")).ok).toBe(false);
    expect((await publicRead.getPublicPortfolioByUserSlug("0")).ok).toBe(false);
    expect((await publicRead.getPublicPortfolioByUserSlug("9999999999")).ok).toBe(false);
  });

  it("a username edit keeps publicSlug stable and creates no new version", async () => {
    const user = await createUser();
    const portfolio = await createPublishablePortfolio(user.id);
    await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));

    const res = await usernames.updateUsername(user.clerkUserId, portfolio.id, "New Name");
    expect(res.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { publicSlug: true, username: true },
    });
    expect(after.publicSlug).toBe(user.publicSlug); // immutable
    expect(after.username).toBe("new-name"); // normalized

    const versionCount = await prisma.portfolioVersion.count({
      where: { portfolioId: portfolio.id },
    });
    expect(versionCount).toBe(1); // username edits never republish
  });

  it("does not let another account change the owner's username", async () => {
    const owner = await createUser();
    const other = await createUser();
    const portfolio = await createPublishablePortfolio(owner.id);

    const res = await usernames.updateUsername(other.clerkUserId, portfolio.id, "hijacked");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("NOT_FOUND");

    const ownerRow = await prisma.user.findUniqueOrThrow({
      where: { id: owner.id },
      select: { username: true },
    });
    expect(ownerRow.username).not.toBe("hijacked");
  });
});
