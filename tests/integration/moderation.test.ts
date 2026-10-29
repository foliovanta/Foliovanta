import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ModerationModule from "@/lib/admin/moderation";
import type * as PublishModule from "@/lib/publishing/publish-service";
import type * as PublicReadModule from "@/lib/publishing/public-read";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
const authMock = vi.mocked(auth);

describe.skipIf(!optedIn)("moderation lifecycle (integration)", () => {
  let moderation: typeof ModerationModule;
  let publish: typeof PublishModule;
  let publicRead: typeof PublicReadModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createUser(role: "USER" | "ADMIN" | "SUPER_ADMIN" = "USER", status: "ACTIVE" | "SUSPENDED" | "DELETION_PENDING" = "ACTIVE") {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, role, status },
      select: { id: true, clerkUserId: true, publicSlug: true },
    });
    createdUserIds.push(user.id);
    return user;
  }
  async function createPublishedPortfolio(ownerClerkId: string, ownerId: string) {
    const portfolio = await prisma.portfolio.create({
      data: { ownerId, slug: `mod-${randomUUID().slice(0, 12)}`, title: "Folio" },
      select: { id: true },
    });
    await prisma.portfolioProfile.create({ data: { portfolioId: portfolio.id, displayName: "Ada" } });
    const r = await publish.publishPortfolio(ownerClerkId, portfolio.id, BigInt(0));
    if (!r.ok) throw new Error(`publish failed: ${r.error}`);
    return portfolio;
  }
  const asActor = (clerkUserId: string) => authMock.mockResolvedValue({ userId: clerkUserId } as never);
  const key = () => `idem-${randomUUID()}`;
  const cid = () => randomUUID();

  const modPf = (portfolioId: string, input: Partial<ModerationModule.PortfolioModerationInput> & { action: ModerationModule.PortfolioModerationInput["action"] }) =>
    moderation.moderatePortfolio(portfolioId, { idempotencyKey: key(), correlationId: cid(), ...input });
  const modAcct = (userId: string, input: Partial<ModerationModule.AccountModerationInput> & { action: ModerationModule.AccountModerationInput["action"] }) =>
    moderation.moderateAccount(userId, { idempotencyKey: key(), correlationId: cid(), ...input });

  const isPublic = async (publicSlug: bigint) =>
    (await publicRead.getPublicPortfolioByUserSlug(publicSlug.toString())).ok;

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    moderation = await import("@/lib/admin/moderation");
    publish = await import("@/lib/publishing/publish-service");
    publicRead = await import("@/lib/publishing/public-read");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  beforeEach(() => authMock.mockReset());

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      await prisma.moderationCommand.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
      await prisma.portfolio.updateMany({ where: { ownerId: { in: createdUserIds } }, data: { activeVersionId: null } });
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("denies a USER and allows an ADMIN to moderate a portfolio", async () => {
    const owner = await createUser("USER");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);

    asActor(owner.clerkUserId); // a plain USER
    expect((await modPf(portfolio.id, { action: "SUSPEND", reason: "nope" })).ok).toBe(false);

    const admin = await createUser("ADMIN");
    asActor(admin.clerkUserId);
    const result = await modPf(portfolio.id, { action: "SUSPEND", reason: "policy breach" });
    expect(result.ok && result.changed && result.newState).toBe("SUSPENDED");
  });

  it("suspending a published portfolio hides it publicly and from the sitemap; reinstating restores it", async () => {
    const owner = await createUser("USER");
    const admin = await createUser("ADMIN");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    expect(await isPublic(owner.publicSlug)).toBe(true);

    asActor(admin.clerkUserId);
    await modPf(portfolio.id, { action: "SUSPEND", reason: "abuse report upheld" });
    expect(await isPublic(owner.publicSlug)).toBe(false);
    const slugs = (await publicRead.listIndexablePortfolios()).map((p) => p.publicSlug);
    expect(slugs).not.toContain(owner.publicSlug.toString());

    await modPf(portfolio.id, { action: "REINSTATE" });
    expect(await isPublic(owner.publicSlug)).toBe(true); // still published, so visible again
  });

  it("marking under review does NOT hide the portfolio", async () => {
    const owner = await createUser("USER");
    const admin = await createUser("ADMIN");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    asActor(admin.clerkUserId);
    const r = await modPf(portfolio.id, { action: "MARK_UNDER_REVIEW", reason: "needs a look" });
    expect(r.ok && r.newState).toBe("UNDER_REVIEW");
    expect(await isPublic(owner.publicSlug)).toBe(true);
  });

  it("requires a reason to suspend and rejects stale expected state", async () => {
    const admin = await createUser("ADMIN");
    const owner = await createUser("USER");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    asActor(admin.clerkUserId);
    expect(await modPf(portfolio.id, { action: "SUSPEND" })).toEqual({ ok: false, error: "REASON_REQUIRED" });
    expect(
      await modPf(portfolio.id, { action: "SUSPEND", reason: "x y z", expectedModerationStatus: "UNDER_REVIEW" }),
    ).toEqual({ ok: false, error: "STATE_CONFLICT" });
  });

  it("is idempotent on retry and rejects key reuse with a different payload", async () => {
    const admin = await createUser("ADMIN");
    const owner = await createUser("USER");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    asActor(admin.clerkUserId);
    const k = key();
    const first = await moderation.moderatePortfolio(portfolio.id, { action: "SUSPEND", reason: "dup test", idempotencyKey: k, correlationId: cid() });
    const retry = await moderation.moderatePortfolio(portfolio.id, { action: "SUSPEND", reason: "dup test", idempotencyKey: k, correlationId: cid() });
    expect(first.ok && first.changed).toBe(true);
    expect(retry.ok && retry.replayed).toBe(true);
    expect(retry.ok && retry.changed).toBe(true); // original result replayed

    // Exactly one state-change audit and one command row for this key.
    const audits = await prisma.auditLog.count({ where: { targetType: "portfolio", targetId: portfolio.id, action: "moderation.portfolio.suspend", outcome: "SUCCESS" } });
    expect(audits).toBe(1);
    expect(await prisma.moderationCommand.count({ where: { idempotencyKey: k } })).toBe(1);

    const conflict = await moderation.moderatePortfolio(portfolio.id, { action: "REINSTATE", idempotencyKey: k, correlationId: cid() });
    expect(conflict).toEqual({ ok: false, error: "IDEMPOTENCY_CONFLICT" });
  });

  it("serializes concurrent suspends so exactly one transition occurs", async () => {
    const admin = await createUser("ADMIN");
    const owner = await createUser("USER");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    asActor(admin.clerkUserId);
    const [a, b] = await Promise.all([
      modPf(portfolio.id, { action: "SUSPEND", reason: "race A" }),
      modPf(portfolio.id, { action: "SUSPEND", reason: "race B" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const changed = [a, b].filter((r) => r.ok && r.changed).length;
    expect(changed).toBe(1); // one applied, the other was an idempotent no-op
    const audits = await prisma.auditLog.count({ where: { targetType: "portfolio", targetId: portfolio.id, action: "moderation.portfolio.suspend", outcome: "SUCCESS" } });
    expect(audits).toBe(1);
  });

  it("writes the state change and its audit atomically with from/to/reason", async () => {
    const admin = await createUser("ADMIN");
    const owner = await createUser("USER");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    asActor(admin.clerkUserId);
    await modPf(portfolio.id, { action: "SUSPEND", reason: "explicit reason text" });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { targetType: "portfolio", targetId: portfolio.id, action: "moderation.portfolio.suspend" },
      select: { metadata: true, actorUserId: true },
    });
    const m = row.metadata as Record<string, unknown>;
    expect(m.fromState).toBe("CLEAR");
    expect(m.toState).toBe("SUSPENDED");
    expect(m.reason).toBe("explicit reason text");
    expect(row.actorUserId).toBe(admin.id);
  });

  it("suspended portfolios cannot be published or rolled back", async () => {
    const admin = await createUser("ADMIN");
    const owner = await createUser("USER");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    asActor(admin.clerkUserId);
    await modPf(portfolio.id, { action: "SUSPEND", reason: "frozen" });

    expect((await publish.publishPortfolio(owner.clerkUserId, portfolio.id, BigInt(0))).ok).toBe(false);
    const rollback = await publish.rollbackPortfolio(owner.clerkUserId, portfolio.id, 1, 1);
    expect(rollback).toMatchObject({ ok: false, error: "PORTFOLIO_SUSPENDED" });
  });

  it("account suspension (SUPER_ADMIN) hides the owner's portfolios; ADMIN cannot; self/admin targets blocked", async () => {
    const superAdmin = await createUser("SUPER_ADMIN");
    const admin = await createUser("ADMIN");
    const owner = await createUser("USER");
    await createPublishedPortfolio(owner.clerkUserId, owner.id);
    expect(await isPublic(owner.publicSlug)).toBe(true);

    // ADMIN lacks admin.users.suspend.
    asActor(admin.clerkUserId);
    expect((await modAcct(owner.id, { action: "SUSPEND", reason: "x y z" })).ok).toBe(false);

    asActor(superAdmin.clerkUserId);
    // Cannot target self or an administrator account.
    expect(await modAcct(superAdmin.id, { action: "SUSPEND", reason: "self" })).toEqual({ ok: false, error: "SELF_TARGET" });
    expect(await modAcct(admin.id, { action: "SUSPEND", reason: "peer" })).toEqual({ ok: false, error: "ADMIN_TARGET" });

    // Suspend the USER account → portfolios hidden; reinstate → visible again.
    const suspend = await modAcct(owner.id, { action: "SUSPEND", reason: "account abuse" });
    expect(suspend.ok && suspend.newState).toBe("SUSPENDED");
    expect(await isPublic(owner.publicSlug)).toBe(false);
    await modAcct(owner.id, { action: "REINSTATE" });
    expect(await isPublic(owner.publicSlug)).toBe(true);
  });

  it("cannot suspend a deletion-pending account", async () => {
    const superAdmin = await createUser("SUPER_ADMIN");
    const owner = await createUser("USER", "DELETION_PENDING");
    asActor(superAdmin.clerkUserId);
    expect(await modAcct(owner.id, { action: "SUSPEND", reason: "too late" })).toEqual({ ok: false, error: "INVALID_TRANSITION" });
  });

  it("revokes moderation ability mid-session when the actor's role changes", async () => {
    const admin = await createUser("ADMIN");
    const owner = await createUser("USER");
    const portfolio = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    asActor(admin.clerkUserId);
    expect((await modPf(portfolio.id, { action: "MARK_UNDER_REVIEW", reason: "first" })).ok).toBe(true);
    await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    expect((await modPf(portfolio.id, { action: "SUSPEND", reason: "second" })).ok).toBe(false);
  });
});
