// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as ProjectsModule from "@/lib/portfolios/projects";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("projects CRUD (integration)", () => {
  let projects: typeof ProjectsModule;
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

  async function createPortfolio(ownerId: string, deletedAt: Date | null = null) {
    return prisma.portfolio.create({
      data: { ownerId, slug: `test-${randomUUID().slice(0, 12)}`, deletedAt },
      select: { id: true },
    });
  }

  async function readRevision(clerkUserId: string, portfolioId: string) {
    const result = await projects.listProjects(clerkUserId, portfolioId);
    if (!result.ok) throw new Error(`listProjects failed: ${result.error}`);
    return result.revision;
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    projects = await import("@/lib/portfolios/projects");
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

  it("supports the owner create/read/update/delete lifecycle with one bump each", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const created = await projects.createProject(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      title: "First project",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.revision).toBe(BigInt(1));
    expect(created.project.position).toBe(0);
    const projectId = created.project.id;

    const list = await projects.listProjects(user.clerkUserId, portfolio.id);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.projects.map((p) => p.id)).toEqual([projectId]);
      expect(list.revision).toBe(BigInt(1));
    }

    const updated = await projects.updateProject(user.clerkUserId, portfolio.id, projectId, {
      expectedRevision: BigInt(1),
      title: "Renamed",
      isFeatured: true,
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.project.title).toBe("Renamed");
      expect(updated.project.isFeatured).toBe(true);
      expect(updated.revision).toBe(BigInt(2));
    }

    const deleted = await projects.deleteProject(
      user.clerkUserId,
      portfolio.id,
      projectId,
      BigInt(2),
    );
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.deletedId).toBe(projectId);
      expect(deleted.revision).toBe(BigInt(3));
    }

    expect(await readRevision(user.clerkUserId, portfolio.id)).toBe(BigInt(3));
    const after = await projects.listProjects(user.clerkUserId, portfolio.id);
    expect(after.ok && after.projects.length).toBe(0);
  });

  it("isolates another user's projects for every mutation", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPortfolio(owner.id);
    const created = await projects.createProject(owner.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      title: "Owned",
    });
    if (!created.ok) throw new Error("setup failed");
    const projectId = created.project.id;

    expect(await projects.listProjects(other.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(
      await projects.createProject(other.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(1),
        title: "Intruder",
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(
      await projects.updateProject(other.clerkUserId, portfolio.id, projectId, {
        expectedRevision: BigInt(1),
        title: "Hacked",
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(
      await projects.deleteProject(other.clerkUserId, portfolio.id, projectId, BigInt(1)),
    ).toEqual({ ok: false, error: "NOT_FOUND" });

    // The owner's project and revision are untouched.
    expect(await readRevision(owner.clerkUserId, portfolio.id)).toBe(BigInt(1));
  });

  it("returns PROJECT_NOT_FOUND for a nonexistent project", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    expect(
      await projects.updateProject(user.clerkUserId, portfolio.id, randomUUID(), {
        expectedRevision: BigInt(0),
        title: "x",
      }),
    ).toEqual({ ok: false, error: "PROJECT_NOT_FOUND" });
    // A failed update must not advance the revision.
    expect(await readRevision(user.clerkUserId, portfolio.id)).toBe(BigInt(0));
  });

  it("treats a soft-deleted portfolio as inaccessible", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id, new Date());
    expect(await projects.listProjects(user.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(
      await projects.createProject(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        title: "x",
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects a suspended account", async () => {
    const user = await createActiveUser("SUSPENDED");
    const portfolio = await createPortfolio(user.id);
    expect(
      await projects.createProject(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        title: "x",
      }),
    ).toEqual({ ok: false, error: "ACCOUNT_SUSPENDED" });
  });

  it("rejects a stale revision and changes nothing", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    await projects.createProject(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      title: "One",
    });

    const stale = await projects.createProject(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      title: "Two",
    });
    expect(stale).toEqual({ ok: false, error: "REVISION_CONFLICT" });

    const list = await projects.listProjects(user.clerkUserId, portfolio.id);
    expect(list.ok && list.projects.length).toBe(1);
    expect(list.ok && list.revision).toBe(BigInt(1));
  });

  it("lets only one of two same-revision creates win, with a single bump", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);

    const [a, b] = await Promise.all([
      projects.createProject(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        title: "A",
      }),
      projects.createProject(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(0),
        title: "B",
      }),
    ]);

    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.error)).sort();
    expect(outcomes).toEqual(["REVISION_CONFLICT", "ok"]);

    const list = await projects.listProjects(user.clerkUserId, portfolio.id);
    expect(list.ok && list.projects.length).toBe(1);
    expect(list.ok && list.revision).toBe(BigInt(1));
  });

  it("reorders projects atomically and rejects duplicate/foreign ids", async () => {
    const user = await createActiveUser();
    const portfolio = await createPortfolio(user.id);
    const a = await projects.createProject(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(0),
      title: "A",
    });
    const b = await projects.createProject(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(1),
      title: "B",
    });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    // Correct reorder: B before A.
    const reordered = await projects.reorderProjects(user.clerkUserId, portfolio.id, {
      expectedRevision: BigInt(2),
      projectIds: [b.project.id, a.project.id],
    });
    expect(reordered.ok).toBe(true);
    if (reordered.ok) {
      expect(reordered.projects.map((p) => p.id)).toEqual([b.project.id, a.project.id]);
      expect(reordered.revision).toBe(BigInt(3));
    }

    // Duplicate id rejected, revision unchanged.
    expect(
      await projects.reorderProjects(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(3),
        projectIds: [a.project.id, a.project.id],
      }),
    ).toEqual({ ok: false, error: "DUPLICATE_PROJECT_IDS" });

    // Foreign/partial id rejected, revision unchanged.
    expect(
      await projects.reorderProjects(user.clerkUserId, portfolio.id, {
        expectedRevision: BigInt(3),
        projectIds: [a.project.id, randomUUID()],
      }),
    ).toEqual({ ok: false, error: "UNKNOWN_PROJECT_IDS" });

    // Both rejections left order and revision intact.
    const list = await projects.listProjects(user.clerkUserId, portfolio.id);
    expect(list.ok && list.revision).toBe(BigInt(3));
    if (list.ok) {
      expect(list.projects.map((p) => p.id)).toEqual([b.project.id, a.project.id]);
    }
  });
});
