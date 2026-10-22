// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  getPortfolioById as GetPortfolioById,
  listPortfolios as ListPortfolios,
} from "@/lib/portfolios/get-portfolios";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("portfolio retrieval (integration)", () => {
  let listPortfolios: typeof ListPortfolios;
  let getPortfolioById: typeof GetPortfolioById;
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

  // Inserts a portfolio directly (bypassing the one-per-owner creation guard)
  // so retrieval behaviour can be set up for an owned user.
  async function insertPortfolio(
    ownerId: string,
    overrides: { deletedAt?: Date; createdAt?: Date } = {},
  ) {
    return prisma.portfolio.create({
      data: {
        ownerId,
        slug: `test-${randomUUID().slice(0, 12)}`,
        ...overrides,
      },
      select: { id: true },
    });
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    ({ listPortfolios, getPortfolioById } = await import("@/lib/portfolios/get-portfolios"));
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

  it("returns an empty array when the user has no portfolios", async () => {
    const user = await createActiveUser();
    const result = await listPortfolios(user.clerkUserId);
    expect(result).toEqual({ ok: true, portfolios: [] });
  });

  it("returns only the owner's portfolios, newest first", async () => {
    const user = await createActiveUser();
    const older = await insertPortfolio(user.id, {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newer = await insertPortfolio(user.id, {
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const result = await listPortfolios(user.clerkUserId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.portfolios.map((p) => p.id)).toEqual([newer.id, older.id]);
      // The summary must not leak internal fields.
      expect(result.portfolios[0]).not.toHaveProperty("ownerId");
      expect(result.portfolios[0]).not.toHaveProperty("draftRevision");
    }
  });

  it("excludes soft-deleted portfolios from the list", async () => {
    const user = await createActiveUser();
    await insertPortfolio(user.id, { deletedAt: new Date() });
    const result = await listPortfolios(user.clerkUserId);
    expect(result).toEqual({ ok: true, portfolios: [] });
  });

  it("isolates portfolios across users", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await insertPortfolio(owner.id);

    const list = await listPortfolios(other.clerkUserId);
    expect(list).toEqual({ ok: true, portfolios: [] });

    const byId = await getPortfolioById(other.clerkUserId, portfolio.id);
    expect(byId).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("returns an owned portfolio by id", async () => {
    const user = await createActiveUser();
    const portfolio = await insertPortfolio(user.id);
    const result = await getPortfolioById(user.clerkUserId, portfolio.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.portfolio.id).toBe(portfolio.id);
    }
  });

  it("returns NOT_FOUND for a nonexistent portfolio id", async () => {
    const user = await createActiveUser();
    const result = await getPortfolioById(user.clerkUserId, randomUUID());
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("returns NOT_FOUND for a soft-deleted portfolio by id", async () => {
    const user = await createActiveUser();
    const portfolio = await insertPortfolio(user.id, { deletedAt: new Date() });
    const result = await getPortfolioById(user.clerkUserId, portfolio.id);
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects an unsynced Clerk user", async () => {
    const clerkUserId = `test_${randomUUID()}`;
    expect(await listPortfolios(clerkUserId)).toEqual({ ok: false, error: "USER_NOT_SYNCED" });
    expect(await getPortfolioById(clerkUserId, randomUUID())).toEqual({
      ok: false,
      error: "USER_NOT_SYNCED",
    });
  });

  it("rejects a suspended user", async () => {
    const user = await createActiveUser("SUSPENDED");
    expect(await listPortfolios(user.clerkUserId)).toEqual({
      ok: false,
      error: "ACCOUNT_SUSPENDED",
    });
    expect(await getPortfolioById(user.clerkUserId, randomUUID())).toEqual({
      ok: false,
      error: "ACCOUNT_SUSPENDED",
    });
  });
});
