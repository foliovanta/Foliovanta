import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as EducationModule from "@/lib/portfolios/education";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("education CRUD (integration)", () => {
  let education: typeof EducationModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createActiveUser() {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}` },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  const createPortfolio = (ownerId: string) =>
    prisma.portfolio.create({
      data: { ownerId, slug: `test-${randomUUID().slice(0, 12)}` },
      select: { id: true },
    });

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    education = await import("@/lib/portfolios/education");
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

  it("creates, updates, reorders and deletes with bumps", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const a = await education.createEducation(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      institution: "MIT",
      degree: "BSc",
    });
    const b = await education.createEducation(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(1),
      institution: "Stanford",
    });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    const updated = await education.updateEducation(user.clerkUserId, portfolio.id, a.item.id, {
      expectedRevision: BigInt(2),
      fieldOfStudy: "CS",
    });
    expect(updated.ok && updated.item.fieldOfStudy).toBe("CS");

    const reordered = await education.reorderEducation(user.clerkUserId, portfolio.id, BigInt(3), [
      b.item.id,
      a.item.id,
    ]);
    expect(reordered.ok && reordered.items.map((i) => i.id)).toEqual([b.item.id, a.item.id]);

    const removed = await education.deleteEducation(
      user.clerkUserId,
      portfolio.id,
      a.item.id,
      BigInt(4),
    );
    expect(removed.ok && removed.revision).toBe(BigInt(5));
  });

  it("isolates another user's education", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);
    const created = await education.createEducation(owner.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      institution: "MIT",
    });
    if (!created.ok) throw new Error("setup failed");

    expect(
      await education.updateEducation(other.clerkUserId, portfolio.id, created.item.id, {
        expectedRevision: BigInt(1),
        institution: "x",
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects an invalid date range", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    expect(
      await education.createEducation(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        institution: "MIT",
        startDate: "2022-01-01",
        endDate: "2020-01-01",
      }),
    ).toEqual({ ok: false, error: "INVALID_DATE_RANGE" });
  });
});
