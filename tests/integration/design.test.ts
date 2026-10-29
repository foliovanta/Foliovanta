import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as PublishModule from "@/lib/publishing/publish-service";
import type * as DesignModule from "@/lib/portfolios/update-design";
import type { DesignConfig } from "@/lib/design/config";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

type SnapshotShape = { portfolio: { theme: Record<string, unknown> } };

const customDesign: DesignConfig = {
  version: 1,
  mode: "dark",
  palette: "emerald",
  accent: null,
  headingFont: "space-grotesk",
  bodyFont: "source-serif",
  layouts: { projects: "grid", experience: "stacked", skills: "compact" },
};

describe.skipIf(!optedIn)("design customization & publishing (integration)", () => {
  let publish: typeof PublishModule;
  let design: typeof DesignModule;
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
      select: { id: true },
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

  const versionTheme = async (portfolioId: string, versionNumber: number) => {
    const v = await prisma.portfolioVersion.findFirstOrThrow({
      where: { portfolioId, versionNumber },
      select: { snapshot: true },
    });
    return (v.snapshot as unknown as SnapshotShape).portfolio.theme;
  };

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    publish = await import("@/lib/publishing/publish-service");
    design = await import("@/lib/portfolios/update-design");
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

  it("returns template defaults when no design is saved", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    const result = await design.getDesignState(user.clerkUserId, portfolio.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.templateKey).toBe("minimal");
      expect(result.state.design.mode).toBe("light");
    }
  });

  it("persists a valid design and bumps the revision", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    const result = await design.updateDesign(
      user.clerkUserId,
      portfolio.id,
      BigInt(0),
      customDesign,
    );
    expect(result.ok).toBe(true);
    expect(await draftRevision(portfolio.id)).toBe(BigInt(1));

    const reloaded = await design.getDesignState(user.clerkUserId, portfolio.id);
    expect(reloaded.ok && reloaded.state.design.palette).toBe("emerald");
  });

  it("rejects an invalid design without bumping the revision", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);
    const result = await design.updateDesign(user.clerkUserId, portfolio.id, BigInt(0), {
      version: 1,
      mode: "neon",
    });
    expect(result).toEqual({ ok: false, error: "INVALID_DESIGN" });
    expect(await draftRevision(portfolio.id)).toBe(BigInt(0));
  });

  it("does not let another account change the design", async () => {
    const owner = await createActiveUser();
    const other = await createActiveUser();
    const portfolio = await createPublishablePortfolio(owner.id);
    const result = await design.updateDesign(
      other.clerkUserId,
      portfolio.id,
      BigInt(0),
      customDesign,
    );
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("publishes an empty theme for an uncustomized portfolio and stays a no-op", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);

    const first = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(first.ok).toBe(true);
    expect(await versionTheme(portfolio.id, 1)).toEqual({});

    // Republishing identical content is idempotent (no new version).
    const again = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(again.ok && again.created).toBe(false);
  });

  it("captures a design change as a new immutable version (hash changes)", async () => {
    const user = await createActiveUser();
    const portfolio = await createPublishablePortfolio(user.id);

    const first = await publish.publishPortfolio(user.clerkUserId, portfolio.id, BigInt(0));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await versionTheme(portfolio.id, first.versionNumber)).toEqual({});

    // Customize the design (publishing never bumped draftRevision).
    const set = await design.updateDesign(
      user.clerkUserId,
      portfolio.id,
      await draftRevision(portfolio.id),
      customDesign,
    );
    expect(set.ok).toBe(true);

    // Already-published version is immutable — still an empty theme.
    expect(await versionTheme(portfolio.id, first.versionNumber)).toEqual({});

    // The design change is a real content change → a new version.
    const second = await publish.publishPortfolio(
      user.clerkUserId,
      portfolio.id,
      await draftRevision(portfolio.id),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.versionNumber).toBe(2);
    const theme = await versionTheme(portfolio.id, 2);
    expect(theme).toMatchObject({ mode: "dark", palette: "emerald", headingFont: "space-grotesk" });
  });
});
