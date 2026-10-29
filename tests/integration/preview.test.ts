import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PreviewModule from "@/lib/publishing/preview";
import type * as PublishModule from "@/lib/publishing/publish-service";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("draft preview (integration)", () => {
  let preview: typeof PreviewModule;
  let publish: typeof PublishModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createUser(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createPortfolio(ownerId: string, deletedAt: Date | null = null) {
    const portfolio = await prisma.portfolio.create({
      data: {
        ownerId,
        slug: `test-${randomUUID().slice(0, 12)}`,
        ...(deletedAt ? { deletedAt } : {}),
      },
      select: { id: true, draftRevision: true },
    });
    await prisma.portfolioProfile.create({
      data: { portfolioId: portfolio.id, displayName: "Ada Lovelace" },
    });
    return portfolio;
  }

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    preview = await import("@/lib/publishing/preview");
    publish = await import("@/lib/publishing/publish-service");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      await prisma.portfolio.updateMany({
        where: { ownerId: { in: createdUserIds } },
        data: { activeVersionId: null },
      });
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("builds a preview for the owner without publishing", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const result = await preview.buildDraftPreview(user.clerkUserId, portfolio.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.profile.displayName).toBe("Ada Lovelace");
    }
  });

  it("denies non-owners, inactive accounts, and soft-deleted portfolios uniformly", async () => {
    const owner = await createUser();
    const other = await createUser();
    const suspended = await createUser("SUSPENDED");
    const portfolio = await createPortfolio(owner.id);
    const deleted = await createPortfolio(owner.id, new Date());

    expect(await preview.buildDraftPreview(other.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(await preview.buildDraftPreview(suspended.clerkUserId, portfolio.id)).toEqual({
      ok: false,
      error: "ACCOUNT_SUSPENDED",
    });
    expect(await preview.buildDraftPreview(owner.clerkUserId, deleted.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("does not create a PortfolioVersion or bump draftRevision", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);

    await preview.buildDraftPreview(user.clerkUserId, portfolio.id);
    await preview.buildDraftPreview(user.clerkUserId, portfolio.id);

    const after = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { draftRevision: true },
    });
    const versions = await prisma.portfolioVersion.count({ where: { portfolioId: portfolio.id } });
    expect(after.draftRevision).toBe(BigInt(0));
    expect(versions).toBe(0);
  });

  it("renders an incomplete draft, dropping invalid URLs and email", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    await prisma.portfolioProfile.update({
      where: { portfolioId: portfolio.id },
      data: { emailPublic: "not-an-email" },
    });
    await prisma.project.create({
      data: {
        portfolioId: portfolio.id,
        title: "Engine",
        projectUrl: "not a url",
        repositoryUrl: "javascript:alert(1)",
        position: 0,
      },
    });

    const result = await preview.buildDraftPreview(user.clerkUserId, portfolio.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.profile.emailPublic).toBeNull();
      expect(result.snapshot.projects[0]?.projectUrl).toBeNull();
      expect(result.snapshot.projects[0]?.repositoryUrl).toBeNull();
    }
  });

  it("reflects the selected template and design, and leaks no private fields", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: {
        templateKey: "creative",
        design: {
          version: 1,
          mode: "dark",
          palette: "emerald",
          accent: null,
          headingFont: "space-grotesk",
          bodyFont: "inter",
          layouts: { projects: "grid", experience: "stacked", skills: "compact" },
        },
      },
    });

    const result = await preview.buildDraftPreview(user.clerkUserId, portfolio.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.portfolio.templateKey).toBe("creative");
    expect(result.snapshot.portfolio.theme).toMatchObject({ mode: "dark", palette: "emerald" });

    const json = JSON.stringify(result.snapshot);
    expect(json).not.toContain(user.id);
    expect(json).not.toContain("ownerId");
    expect(json).not.toContain(user.clerkUserId);
  });

  it("leaves published content unchanged", async () => {
    const user = await createUser();
    const portfolio = await createPortfolio(user.id);
    const published = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(published.ok).toBe(true);

    await preview.buildDraftPreview(user.clerkUserId, portfolio.id);

    const after = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { publicationStatus: true, activeVersionId: true },
    });
    const versions = await prisma.portfolioVersion.count({ where: { portfolioId: portfolio.id } });
    expect(after.publicationStatus).toBe("PUBLISHED");
    expect(after.activeVersionId).not.toBeNull();
    expect(versions).toBe(1); // preview added nothing
  });
});
