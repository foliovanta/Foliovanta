// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { createPortfolio as CreatePortfolio } from "@/lib/portfolios/create-portfolio";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("createPortfolio (integration)", () => {
  let createPortfolio: typeof CreatePortfolio;
  let prisma: typeof Prisma;

  // Every record this suite creates is tracked and removed in afterAll; it
  // never touches rows it did not create and never resets any table.
  const createdUserIds: string[] = [];

  async function createActiveUser(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  const uniqueSlug = () => `test-${randomUUID().slice(0, 12)}`;

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    ({ createPortfolio } = await import("@/lib/portfolios/create-portfolio"));
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    // prisma is unset if the safety gate threw in beforeAll; nothing was written.
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("rejects an unsynced Clerk user", async () => {
    const result = await createPortfolio({
      clerkUserId: `test_${randomUUID()}`,
      slug: uniqueSlug(),
    });
    expect(result).toEqual({ ok: false, error: "USER_NOT_SYNCED" });
  });

  it("rejects a non-active user", async () => {
    const user = await createActiveUser("SUSPENDED");
    const result = await createPortfolio({
      clerkUserId: user.clerkUserId,
      slug: uniqueSlug(),
    });
    expect(result).toEqual({ ok: false, error: "ACCOUNT_SUSPENDED" });
  });

  it("rejects an invalid slug", async () => {
    const user = await createActiveUser();
    const result = await createPortfolio({ clerkUserId: user.clerkUserId, slug: "!!!" });
    expect(result).toEqual({ ok: false, error: "INVALID_SLUG" });
  });

  it("rejects a reserved slug", async () => {
    const user = await createActiveUser();
    const result = await createPortfolio({ clerkUserId: user.clerkUserId, slug: "Admin" });
    expect(result).toEqual({ ok: false, error: "SLUG_RESERVED" });
  });

  it("creates a portfolio for an active user", async () => {
    const user = await createActiveUser();
    const result = await createPortfolio({
      clerkUserId: user.clerkUserId,
      slug: uniqueSlug(),
      title: "  My Portfolio  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.portfolio.title).toBe("My Portfolio");
      expect(result.portfolio.publicationStatus).toBe("DRAFT");
    }
  });

  it("surfaces a slug conflict across owners as SLUG_TAKEN", async () => {
    const slug = uniqueSlug();
    const owner = await createActiveUser();
    const other = await createActiveUser();

    const first = await createPortfolio({ clerkUserId: owner.clerkUserId, slug });
    expect(first.ok).toBe(true);

    const second = await createPortfolio({ clerkUserId: other.clerkUserId, slug });
    expect(second).toEqual({ ok: false, error: "SLUG_TAKEN" });
  });

  it("enforces one non-deleted portfolio per owner", async () => {
    const user = await createActiveUser();
    const first = await createPortfolio({ clerkUserId: user.clerkUserId, slug: uniqueSlug() });
    expect(first.ok).toBe(true);

    const second = await createPortfolio({ clerkUserId: user.clerkUserId, slug: uniqueSlug() });
    expect(second).toEqual({ ok: false, error: "PORTFOLIO_LIMIT_REACHED" });
  });

  it("allows a new portfolio once the prior one is soft-deleted", async () => {
    const user = await createActiveUser();
    const first = await createPortfolio({ clerkUserId: user.clerkUserId, slug: uniqueSlug() });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await prisma.portfolio.update({
      where: { id: first.portfolio.id },
      data: { deletedAt: new Date() },
    });

    const second = await createPortfolio({ clerkUserId: user.clerkUserId, slug: uniqueSlug() });
    expect(second.ok).toBe(true);
  });

  it("serializes concurrent creates for the same owner", async () => {
    const user = await createActiveUser();
    const [a, b] = await Promise.all([
      createPortfolio({ clerkUserId: user.clerkUserId, slug: uniqueSlug() }),
      createPortfolio({ clerkUserId: user.clerkUserId, slug: uniqueSlug() }),
    ]);

    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.error)).sort();
    expect(outcomes).toEqual(["PORTFOLIO_LIMIT_REACHED", "ok"]);
  });

  it("lets only one owner win a concurrent slug race", async () => {
    const slug = uniqueSlug();
    const first = await createActiveUser();
    const second = await createActiveUser();

    const [a, b] = await Promise.all([
      createPortfolio({ clerkUserId: first.clerkUserId, slug }),
      createPortfolio({ clerkUserId: second.clerkUserId, slug }),
    ]);

    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.error)).sort();
    expect(outcomes).toEqual(["SLUG_TAKEN", "ok"]);
  });
});
