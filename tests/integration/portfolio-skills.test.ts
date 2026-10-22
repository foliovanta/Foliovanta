import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as SkillsModule from "@/lib/portfolios/skills";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("skills CRUD (integration)", () => {
  let skills: typeof SkillsModule;
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
    skills = await import("@/lib/portfolios/skills");
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

    const a = await skills.createSkill(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      name: "TypeScript",
      category: "Language",
    });
    const b = await skills.createSkill(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(1),
      name: "Prisma",
    });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    const updated = await skills.updateSkill(user.clerkUserId, portfolio.id, a.item.id, {
      expectedRevision: BigInt(2),
      proficiency: "Expert",
    });
    expect(updated.ok && updated.item.proficiency).toBe("Expert");

    const reordered = await skills.reorderSkills(user.clerkUserId, portfolio.id, BigInt(3), [
      b.item.id,
      a.item.id,
    ]);
    expect(reordered.ok && reordered.items.map((i) => i.id)).toEqual([b.item.id, a.item.id]);

    expect(
      await skills.reorderSkills(user.clerkUserId, portfolio.id, BigInt(4), [a.item.id, a.item.id]),
    ).toEqual({ ok: false, error: "DUPLICATE_IDS" });

    const removed = await skills.deleteSkill(user.clerkUserId, portfolio.id, a.item.id, BigInt(4));
    expect(removed.ok && removed.revision).toBe(BigInt(5));
  });

  it("isolates another user's skills", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);
    const created = await skills.createSkill(owner.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      name: "TypeScript",
    });
    if (!created.ok) throw new Error("setup failed");

    expect(await skills.listSkills(other.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(
      await skills.deleteSkill(other.clerkUserId, portfolio.id, created.item.id, BigInt(1)),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
