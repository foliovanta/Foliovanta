// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  getPortfolioProfile as GetPortfolioProfile,
  updatePortfolioProfile as UpdatePortfolioProfile,
} from "@/lib/portfolios/profile";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("portfolio profile editing (integration)", () => {
  let getPortfolioProfile: typeof GetPortfolioProfile;
  let updatePortfolioProfile: typeof UpdatePortfolioProfile;
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

  async function createPortfolio(ownerId: string, deletedAt: Date | null = null) {
    return prisma.portfolio.create({
      data: { ownerId, slug: `test-${randomUUID().slice(0, 12)}`, deletedAt },
      select: { id: true },
    });
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    ({ getPortfolioProfile, updatePortfolioProfile } = await import("@/lib/portfolios/profile"));
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

  it("returns a default profile and revision 0 when none exists", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const result = await getPortfolioProfile(user.clerkUserId, portfolio.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.displayName).toBe("");
      expect(result.profile.updatedAt).toBeNull();
      expect(result.revision).toBe(BigInt(0));
    }
  });

  it("lets the owner update the profile and increments the revision", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const first = await updatePortfolioProfile(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      displayName: "Ada Lovelace",
      headline: "Mathematician",
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.profile.displayName).toBe("Ada Lovelace");
      expect(first.revision).toBe(BigInt(1));
    }

    const second = await updatePortfolioProfile(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(1),
      headline: "Pioneer",
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.revision).toBe(BigInt(2));
      expect(second.profile.displayName).toBe("Ada Lovelace"); // unchanged field preserved
      expect(second.profile.headline).toBe("Pioneer");
    }
  });

  it("rejects a stale revision with REVISION_CONFLICT and changes nothing", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    await updatePortfolioProfile(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      displayName: "First",
    });

    const stale = await updatePortfolioProfile(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      displayName: "Second",
    });
    expect(stale).toEqual({ ok: false, error: "REVISION_CONFLICT" });

    const after = await getPortfolioProfile(user.clerkUserId, portfolio.id);
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.revision).toBe(BigInt(1));
      expect(after.profile.displayName).toBe("First");
    }
  });

  it("lets only one of two same-revision requests win, with a single increment", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const [a, b] = await Promise.all([
      updatePortfolioProfile(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        displayName: "A",
      }),
      updatePortfolioProfile(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        displayName: "B",
      }),
    ]);

    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.error)).sort();
    expect(outcomes).toEqual(["REVISION_CONFLICT", "ok"]);

    // The loser left no partial write: revision advanced exactly once.
    const after = await getPortfolioProfile(user.clerkUserId, portfolio.id);
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.revision).toBe(BigInt(1));
      const winner = a.ok ? "A" : "B";
      expect(after.profile.displayName).toBe(winner);
    }
  });

  it("isolates another user's profile for both read and update", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);

    expect(await getPortfolioProfile(other.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(
      await updatePortfolioProfile(other.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        displayName: "Intruder",
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("treats a soft-deleted portfolio as inaccessible", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id, new Date());

    expect(await getPortfolioProfile(user.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(
      await updatePortfolioProfile(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        displayName: "Nope",
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects a suspended account", async () => {
    const user = await createActiveUser("SUSPENDED");
    const portfolio = await createPortfolio(user.id);

    expect(await getPortfolioProfile(user.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "ACCOUNT_SUSPENDED",
    });
    expect(
      await updatePortfolioProfile(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        displayName: "Nope",
      }),
    ).toEqual({ ok: false, error: "ACCOUNT_SUSPENDED" });
  });

  it("rejects an unsynced user", async () => {
    const result = await getPortfolioProfile(`test_${randomUUID()}`, randomUUID());
    expect(result).toEqual({ ok: false, error: "USER_NOT_SYNCED" });
  });
});
