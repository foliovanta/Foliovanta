import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PublishModule from "@/lib/publishing/publish-service";
import type * as TemplateModule from "@/lib/portfolios/update-template";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

type SnapshotShape = { portfolio: { templateKey: string; templateVersion: string } };

describe.skipIf(!optedIn)("template selection & publishing (integration)", () => {
  let publish: typeof PublishModule;
  let templates: typeof TemplateModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createActiveUser() {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status: "ACTIVE" },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createPublishablePortfolio(ownerId: string) {
    const portfolio = await prisma.portfolio.create({
      data: { ownerId, slug: `test-${randomUUID().slice(0, 12)}` },
      select: { id: true, templateKey: true, templateVersion: true, draftRevision: true },
    });
    await prisma.portfolioProfile.create({
      data: { portfolioId: portfolio.id, displayName: "Ada Lovelace" },
    });
    return portfolio;
  }

  const draftRevision = (id: string) =>
    prisma.portfolio
      .findUniqueOrThrow({ where: { id }, select: { draftRevision: true } })
      .then((p) => p.draftRevision);

  const versionSnapshot = async (portfolioId: string, versionNumber: number) => {
    const v = await prisma.portfolioVersion.findFirstOrThrow({
      where: { portfolioId, versionNumber },
      select: { snapshot: true },
    });
    return v.snapshot as unknown as SnapshotShape;
  };

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    publish = await import("@/lib/publishing/publish-service");
    templates = await import("@/lib/portfolios/update-template");
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

  it("defaults to minimal and persists a new selection under optimistic concurrency", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    expect(portfolio.templateKey).toBe("minimal");

    const result = await templates.updateTemplate(
      user.clerkUserId,
      portfolio.id,
      BigInt(0),
      "creative",
    );
    expect(result.ok).toBe(true);

    const row = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      select: { templateKey: true, templateVersion: true, draftRevision: true },
    });
    expect(row.templateKey).toBe("creative");
    expect(row.templateVersion).toBe("1.0.0");
    expect(row.draftRevision).toBe(BigInt(1)); // revision bumped
  });

  it("rejects an unsupported template without bumping the revision", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    const result = await templates.updateTemplate(
      user.clerkUserId,
      portfolio.id,
      BigInt(0),
      "fancy",
    );
    expect(result).toEqual({ ok: false, error: "INVALID_TEMPLATE" });
    expect(await draftRevision(portfolio.id)).toBe(BigInt(0));
  });

  it("enforces a revision conflict on a stale expected revision", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    const result = await templates.updateTemplate(
      user.clerkUserId,
      portfolio.id,
      BigInt(99),
      "professional",
    );
    expect(result).toEqual({ ok: false, error: "REVISION_CONFLICT" });
  });

  it("does not let another account change a portfolio's template", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPublishablePortfolio(owner.id);
    const result = await templates.updateTemplate(
      other.clerkUserId,
      portfolio.id,
      BigInt(0),
      "creative",
    );
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("publishes using the selected template", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    const set = await templates.updateTemplate(
      user.clerkUserId,
      portfolio.id,
      BigInt(0),
      "professional",
    );
    expect(set.ok).toBe(true);
    if (!set.ok) return;

    const pub = await publish.publishPortfolio(user.clerkUserId, portfolio.id, set.revision);
    expect(pub.ok).toBe(true);

    const snapshot = await versionSnapshot(portfolio.id, 1);
    expect(snapshot.portfolio.templateKey).toBe("professional");
  });

  it("does not alter a published version when the draft template later changes", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);

    // Publish on the default (minimal).
    const pub1 = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(pub1.ok).toBe(true);
    if (!pub1.ok) return;
    expect((await versionSnapshot(portfolio.id, pub1.versionNumber)).portfolio.templateKey).toBe(
      "minimal",
    );

    // Change the draft template (publishing never bumped draftRevision).
    const set = await templates.updateTemplate(
      user.clerkUserId,
      portfolio.id,
      await draftRevision(portfolio.id),
      "creative",
    );
    expect(set.ok).toBe(true);

    // The already-published version is immutable — still minimal.
    expect((await versionSnapshot(portfolio.id, pub1.versionNumber)).portfolio.templateKey).toBe(
      "minimal",
    );

    // Publishing again captures the new template as a new version.
    const pub2 = await publish.publishPortfolio(
      user.clerkUserId,
      portfolio.id,
      await draftRevision(portfolio.id),
    );
    expect(pub2.ok).toBe(true);
    if (!pub2.ok) return;
    expect(pub2.versionNumber).toBe(2);
    expect((await versionSnapshot(portfolio.id, 2)).portfolio.templateKey).toBe("creative");
  });
});
