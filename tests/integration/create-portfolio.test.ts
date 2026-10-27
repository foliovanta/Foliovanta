// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { createPortfolio as CreatePortfolio } from "@/lib/portfolios/create-portfolio";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

// Internal slugs are server-generated; they must still satisfy the stored slug
// format (hostname-label shape) used by the snapshot/readiness validators.
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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
    const result = await createPortfolio({ clerkUserId: `test_${randomUUID()}` });
    expect(result).toEqual({ ok: false, error: "USER_NOT_SYNCED" });
  });

  it("rejects a non-active user", async () => {
    const user = await createActiveUser("SUSPENDED");
    const result = await createPortfolio({ clerkUserId: user.clerkUserId });
    expect(result).toEqual({ ok: false, error: "ACCOUNT_SUSPENDED" });
  });

  it("creates a portfolio with a server-generated valid slug and trimmed title", async () => {
    const user = await createActiveUser();
    const result = await createPortfolio({ clerkUserId: user.clerkUserId, title: "  My Portfolio  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.portfolio.title).toBe("My Portfolio");
      expect(result.portfolio.publicationStatus).toBe("DRAFT");
      expect(result.portfolio.slug).toMatch(SLUG_PATTERN);
    }
  });

  it("enforces one non-deleted portfolio per owner", async () => {
    const user = await createActiveUser();
    const first = await createPortfolio({ clerkUserId: user.clerkUserId });
    expect(first.ok).toBe(true);

    const second = await createPortfolio({ clerkUserId: user.clerkUserId });
    expect(second).toEqual({ ok: false, error: "PORTFOLIO_LIMIT_REACHED" });
  });

  it("allows a new portfolio with a distinct slug once the prior one is soft-deleted", async () => {
    const user = await createActiveUser();
    const first = await createPortfolio({ clerkUserId: user.clerkUserId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await prisma.portfolio.update({
      where: { id: first.portfolio.id },
      data: { deletedAt: new Date() },
    });

    const second = await createPortfolio({ clerkUserId: user.clerkUserId });
    expect(second.ok).toBe(true);
    if (second.ok) {
      // The full unique slug index still reserves the soft-deleted row's slug,
      // so the regenerated slug must differ.
      expect(second.portfolio.slug).not.toBe(first.portfolio.slug);
    }
  });

  it("serializes concurrent creates for the same owner", async () => {
    const user = await createActiveUser();
    const [a, b] = await Promise.all([
      createPortfolio({ clerkUserId: user.clerkUserId }),
      createPortfolio({ clerkUserId: user.clerkUserId }),
    ]);

    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.error)).sort();
    expect(outcomes).toEqual(["PORTFOLIO_LIMIT_REACHED", "ok"]);
  });
});
