import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as SectionsModule from "@/lib/portfolios/sections";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("section reorder (integration)", () => {
  let sections: typeof SectionsModule;
  let REGISTRY: typeof SectionsModule.SECTION_KEYS;
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

  async function revisionOf(clerkUserId: string, portfolioId: string) {
    const r = await sections.listSections(clerkUserId, portfolioId);
    if (!r.ok) throw new Error(r.error);
    return r.revision;
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    sections = await import("@/lib/portfolios/sections");
    REGISTRY = sections.SECTION_KEYS;
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      // PortfolioSection cascades on portfolio delete; remove portfolios + users.
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("materializes all rows with deterministic 0-based positions", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const desired = [...REGISTRY].reverse();

    const result = await sections.reorderSections(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      sectionKeys: [...desired],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.revision).toBe(BigInt(1));
    expect(result.sections.map((s) => s.sectionKey)).toEqual(desired);
    expect(result.sections.map((s) => s.position)).toEqual(desired.map((_, index) => index));
    // Every registry key now has a row.
    expect(result.sections).toHaveLength(REGISTRY.length);
  });

  it("preserves existing visibility and config while reordering", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const first = REGISTRY[0]!;

    await sections.updateSection(user.clerkUserId, portfolio.id, first, {
      expectedRevision: BigInt(0),
      isVisible: false,
      config: { columns: 3 },
    });

    const reordered = await sections.reorderSections(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(1),
      sectionKeys: [...REGISTRY].reverse(),
    });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;

    const row = reordered.sections.find((s) => s.sectionKey === first);
    expect(row?.isVisible).toBe(false);
    expect(row?.config).toEqual({ columns: 3 });
  });

  it("rejects a stale revision without writing or bumping", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    await sections.reorderSections(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      sectionKeys: [...REGISTRY],
    });

    const stale = await sections.reorderSections(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      sectionKeys: [...REGISTRY].reverse(),
    });
    expect(stale).toEqual({ ok: false, error: "REVISION_CONFLICT" });

    // Order and revision unchanged by the rejected request.
    const after = await sections.listSections(user.clerkUserId, portfolio.id);
    expect(after.ok && after.revision).toBe(BigInt(1));
    if (after.ok) {
      expect(after.sections.map((s) => s.sectionKey)).toEqual([...REGISTRY]);
    }
  });

  it("lets only one of two same-revision reorders win", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const [a, b] = await Promise.all([
      sections.reorderSections(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        sectionKeys: [...REGISTRY],
      }),
      sections.reorderSections(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        sectionKeys: [...REGISTRY].reverse(),
      }),
    ]);
    expect([a, b].map((r) => (r.ok ? "ok" : r.error)).sort()).toEqual(["REVISION_CONFLICT", "ok"]);
    expect(await revisionOf(user.clerkUserId, portfolio.id)).toBe(BigInt(1));
  });

  it("isolates another user's portfolio", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);

    const result = await sections.reorderSections(other.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      sectionKeys: [...REGISTRY],
    });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    // Owner's portfolio was not written to.
    const owned = await sections.listSections(owner.clerkUserId, portfolio.id);
    expect(owned.ok && owned.sections).toHaveLength(0);
  });

  it("rejects a soft-deleted portfolio", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id, new Date());
    const result = await sections.reorderSections(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      sectionKeys: [...REGISTRY],
    });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
