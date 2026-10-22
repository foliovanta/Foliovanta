import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as SectionsModule from "@/lib/portfolios/sections";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("portfolio sections (integration)", () => {
  let sections: typeof SectionsModule;
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

  const createPortfolio = (ownerId: string, deletedAt: Date | null = null) =>
    prisma.portfolio.create({
      data: { ownerId, slug: `test-${randomUUID().slice(0, 12)}`, deletedAt },
      select: { id: true },
    });

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    sections = await import("@/lib/portfolios/sections");
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

  it("starts empty, then upserts a section on update", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const empty = await sections.listSections(user.clerkUserId, portfolio.id);
    expect(empty.ok && empty.sections.length).toBe(0);
    expect(empty.ok && empty.revision).toBe(BigInt(0));

    const updated = await sections.updateSection(user.clerkUserId, portfolio.id, "PROJECTS", {
      expectedRevision: BigInt(0),
      isVisible: false,
      position: 2,
      layoutVariant: "grid",
      config: { columns: 3 },
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.section.sectionKey).toBe("PROJECTS");
      expect(updated.section.isVisible).toBe(false);
      expect(updated.section.position).toBe(2);
      expect(updated.revision).toBe(BigInt(1));
    }

    const list = await sections.listSections(user.clerkUserId, portfolio.id);
    expect(list.ok && list.sections.map((s) => s.sectionKey)).toEqual(["PROJECTS"]);
  });

  it("updates an existing section in place and rejects a stale revision", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    await sections.updateSection(user.clerkUserId, portfolio.id, "ABOUT", {
      expectedRevision: BigInt(0),
      isVisible: true,
    });

    const visible = await sections.updateSection(user.clerkUserId, portfolio.id, "ABOUT", {
      expectedRevision: BigInt(1),
      isVisible: false,
    });
    expect(visible.ok && visible.section.isVisible).toBe(false);
    expect(visible.ok && visible.revision).toBe(BigInt(2));

    expect(
      await sections.updateSection(user.clerkUserId, portfolio.id, "ABOUT", {
        expectedRevision: BigInt(0),
        isVisible: true,
      }),
    ).toEqual({ ok: false, error: "REVISION_CONFLICT" });
  });

  it("isolates another user's sections and excludes soft-deleted portfolios", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);

    expect(await sections.listSections(other.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(
      await sections.updateSection(other.clerkUserId, portfolio.id, "CONTACT", {
        expectedRevision: BigInt(0),
        isVisible: true,
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });

    const deleted = await createPortfolio(owner.id, new Date());
    expect(await sections.listSections(owner.clerkUserId, deleted.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});
