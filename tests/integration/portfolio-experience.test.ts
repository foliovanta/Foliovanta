import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as ExperienceModule from "@/lib/portfolios/experience";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("experience CRUD (integration)", () => {
  let experience: typeof ExperienceModule;
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

  const createPortfolio = (ownerId: string, deletedAt: Date | null = null) =>
    prisma.portfolio.create({
      data: { ownerId, slug: `test-${randomUUID().slice(0, 12)}`, deletedAt },
      select: { id: true },
    });

  async function revision(clerkUserId: string, portfolioId: string) {
    const result = await experience.listExperiences(clerkUserId, portfolioId);
    if (!result.ok) throw new Error(result.error);
    return result.revision;
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    experience = await import("@/lib/portfolios/experience");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("supports create/read/update/delete with one bump per mutation", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const created = await experience.createExperience(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      organization: "Acme",
      roleTitle: "Engineer",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.revision).toBe(BigInt(1));
    expect(created.item.position).toBe(0);

    const updated = await experience.updateExperience(
      user.clerkUserId,
      portfolio.id,
      created.item.id,
      {
        expectedRevision: BigInt(1),
        roleTitle: "Staff Engineer",
      },
    );
    expect(updated.ok && updated.item.roleTitle).toBe("Staff Engineer");
    expect(updated.ok && updated.revision).toBe(BigInt(2));

    const removed = await experience.deleteExperience(
      user.clerkUserId,
      portfolio.id,
      created.item.id,
      BigInt(2),
    );
    expect(removed.ok && removed.revision).toBe(BigInt(3));

    const list = await experience.listExperiences(user.clerkUserId, portfolio.id);
    expect(list.ok && list.items.length).toBe(0);
  });

  it("isolates another user's experiences", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);
    const created = await experience.createExperience(owner.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      organization: "Acme",
      roleTitle: "Engineer",
    });
    if (!created.ok) throw new Error("setup failed");

    expect(await experience.listExperiences(other.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(
      await experience.updateExperience(other.clerkUserId, portfolio.id, created.item.id, {
        expectedRevision: BigInt(1),
        roleTitle: "Hacked",
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(
      await experience.deleteExperience(
        other.clerkUserId,
        portfolio.id,
        created.item.id,
        BigInt(1),
      ),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await revision(owner.clerkUserId, portfolio.id)).toBe(BigInt(1));
  });

  it("rejects soft-deleted portfolios and suspended/unsynced users", async () => {
    const deletedOwner = await createActiveUser();
    const deletedPortfolio = await createPortfolio(deletedOwner.id, new Date());
    expect(await experience.listExperiences(deletedOwner.clerkUserId, deletedPortfolio.id)).toEqual(
      {
        ok: false,
        error: "NOT_FOUND",
      },
    );

    const suspended = await createActiveUser("SUSPENDED");
    const suspendedPortfolio = await createPortfolio(suspended.id);
    expect(
      await experience.createExperience(suspended.clerkUserId, suspendedPortfolio.id, {
        expectedRevision: BigInt(0),
        organization: "x",
        roleTitle: "y",
      }),
    ).toEqual({ ok: false, error: "ACCOUNT_SUSPENDED" });

    expect(await experience.listExperiences(`test_${randomUUID()}`, suspendedPortfolio.id)).toEqual(
      { ok: false, error: "USER_NOT_SYNCED" },
    );
  });

  it("rejects a stale revision and a concurrent duplicate, bumping once", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const [a, b] = await Promise.all([
      experience.createExperience(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        organization: "A",
        roleTitle: "r",
      }),
      experience.createExperience(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        organization: "B",
        roleTitle: "r",
      }),
    ]);
    expect([a, b].map((r) => (r.ok ? "ok" : r.error)).sort()).toEqual(["REVISION_CONFLICT", "ok"]);

    const list = await experience.listExperiences(user.clerkUserId, portfolio.id);
    expect(list.ok && list.items.length).toBe(1);
    expect(list.ok && list.revision).toBe(BigInt(1));

    const stale = await experience.createExperience(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      organization: "late",
      roleTitle: "r",
    });
    expect(stale).toEqual({ ok: false, error: "REVISION_CONFLICT" });
  });

  it("reorders atomically and rejects duplicate/unknown ids without a bump", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const a = await experience.createExperience(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      organization: "A",
      roleTitle: "r",
    });
    const b = await experience.createExperience(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(1),
      organization: "B",
      roleTitle: "r",
    });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    const reordered = await experience.reorderExperiences(
      user.clerkUserId,
      portfolio.id,
      BigInt(2),
      [b.item.id, a.item.id],
    );
    expect(reordered.ok && reordered.items.map((i) => i.id)).toEqual([b.item.id, a.item.id]);
    expect(reordered.ok && reordered.revision).toBe(BigInt(3));

    expect(
      await experience.reorderExperiences(user.clerkUserId, portfolio.id, BigInt(3), [
        a.item.id,
        a.item.id,
      ]),
    ).toEqual({ ok: false, error: "DUPLICATE_IDS" });
    expect(
      await experience.reorderExperiences(user.clerkUserId, portfolio.id, BigInt(3), [
        a.item.id,
        randomUUID(),
      ]),
    ).toEqual({ ok: false, error: "UNKNOWN_IDS" });

    expect(await revision(user.clerkUserId, portfolio.id)).toBe(BigInt(3));
  });

  it("validates dates and leaves the revision unchanged on rejection", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    expect(
      await experience.createExperience(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        organization: "A",
        roleTitle: "r",
        startDate: "2022-01-01",
        endDate: "2020-01-01",
      }),
    ).toEqual({ ok: false, error: "INVALID_DATE_RANGE" });

    expect(
      await experience.createExperience(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        organization: "A",
        roleTitle: "r",
        isCurrent: true,
        endDate: "2020-01-01",
      }),
    ).toEqual({ ok: false, error: "CURRENT_WITH_END_DATE" });

    expect(await revision(user.clerkUserId, portfolio.id)).toBe(BigInt(0));
  });

  it("enforces the date CHECK constraint at the database level", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    await expect(
      prisma.experience.create({
        data: {
          portfolioId: portfolio.id,
          organization: "A",
          roleTitle: "r",
          startDate: new Date("2022-01-01"),
          endDate: new Date("2020-01-01"),
        },
      }),
    ).rejects.toThrow();
  });
});
