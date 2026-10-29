import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as FeedbackModule from "@/lib/feedback/service";
import type * as ReportsModule from "@/lib/reports/service";
import type * as ModerationModule from "@/lib/admin/moderation";
import type * as PublishModule from "@/lib/publishing/publish-service";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
const authMock = vi.mocked(auth);

describe.skipIf(!optedIn)("feedback & abuse reports (integration)", () => {
  let feedback: typeof FeedbackModule;
  let reports: typeof ReportsModule;
  let moderation: typeof ModerationModule;
  let publish: typeof PublishModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createUser(role: "USER" | "ADMIN" | "SUPER_ADMIN" = "USER", status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, role, status },
      select: { id: true, clerkUserId: true, publicSlug: true },
    });
    createdUserIds.push(user.id);
    return user;
  }
  async function createPublishedPortfolio(ownerClerkId: string, ownerId: string) {
    const p = await prisma.portfolio.create({ data: { ownerId, slug: `fr-${randomUUID().slice(0, 12)}`, title: "F" }, select: { id: true } });
    await prisma.portfolioProfile.create({ data: { portfolioId: p.id, displayName: "Ada" } });
    const r = await publish.publishPortfolio(ownerClerkId, p.id, BigInt(0));
    if (!r.ok) throw new Error(`publish failed: ${r.error}`);
    return p;
  }
  const asActor = (clerkUserId: string) => authMock.mockResolvedValue({ userId: clerkUserId } as never);
  const key = () => `idem-${randomUUID()}`;

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    feedback = await import("@/lib/feedback/service");
    reports = await import("@/lib/reports/service");
    moderation = await import("@/lib/admin/moderation");
    publish = await import("@/lib/publishing/publish-service");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  beforeEach(() => authMock.mockReset());

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      await prisma.moderationCommand.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
      await prisma.abuseReport.deleteMany({ where: { reporterUserId: { in: createdUserIds } } });
      await prisma.feedback.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portfolio.updateMany({ where: { ownerId: { in: createdUserIds } }, data: { activeVersionId: null } });
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  // ---- Feedback ----

  it("accepts feedback from an ACTIVE user, denies suspended and unsynced", async () => {
    const user = await createUser("USER");
    const r = await feedback.submitFeedback(user.clerkUserId, { category: "BUG", message: "broke" });
    expect(r.ok).toBe(true);

    const suspended = await createUser("USER", "SUSPENDED");
    expect(await feedback.submitFeedback(suspended.clerkUserId, { category: "BUG", message: "x" })).toMatchObject({ ok: false, error: "ACCOUNT_SUSPENDED" });

    expect(await feedback.submitFeedback(`test_${randomUUID()}`, { category: "BUG", message: "x" })).toMatchObject({ ok: false, error: "USER_NOT_SYNCED" });
  });

  it("rejects a non-owned portfolio reference and dedups identical submissions", async () => {
    const user = await createUser("USER");
    const other = await createUser("USER");
    const foreign = await prisma.portfolio.create({ data: { ownerId: other.id, slug: `fr-${randomUUID().slice(0, 12)}` }, select: { id: true } });
    expect(await feedback.submitFeedback(user.clerkUserId, { category: "BUG", message: "x", portfolioId: foreign.id })).toMatchObject({ ok: false, error: "PORTFOLIO_NOT_OWNED" });

    const a = await feedback.submitFeedback(user.clerkUserId, { category: "OTHER", message: "same text" });
    const b = await feedback.submitFeedback(user.clerkUserId, { category: "OTHER", message: "same text" });
    expect(a.ok && b.ok && b.deduped).toBe(true);
    if (a.ok && b.ok) expect(b.id).toBe(a.id);
  });

  it("gates the feedback queue and runs triage transitions idempotently", async () => {
    const user = await createUser("USER");
    const admin = await createUser("ADMIN");
    const sub = await feedback.submitFeedback(user.clerkUserId, { category: "USABILITY", message: "confusing" });
    if (!sub.ok) throw new Error("submit failed");

    asActor(user.clerkUserId);
    expect((await feedback.listAdminFeedback({ limit: 10 })).ok).toBe(false); // USER denied

    asActor(admin.clerkUserId);
    expect((await feedback.listAdminFeedback({ limit: 10 })).ok).toBe(true);

    const k = key();
    const first = await feedback.triageFeedback(sub.id, { action: "RESOLVE", resolutionNote: "fixed", idempotencyKey: k, correlationId: randomUUID() });
    const replay = await feedback.triageFeedback(sub.id, { action: "RESOLVE", resolutionNote: "fixed", idempotencyKey: k, correlationId: randomUUID() });
    expect(first.ok && first.newState).toBe("RESOLVED");
    expect(replay.ok && replay.replayed).toBe(true);

    // Audit written, without the message text.
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetType: "feedback", targetId: sub.id, action: "feedback.resolved" }, select: { metadata: true } });
    const m = audit.metadata as Record<string, unknown>;
    expect(m.toState).toBe("RESOLVED");
    expect(JSON.stringify(m)).not.toContain("confusing");

    // Invalid transition (REVIEW from RESOLVED) and stale expected-state.
    expect(await feedback.triageFeedback(sub.id, { action: "REVIEW", idempotencyKey: key(), correlationId: randomUUID() })).toMatchObject({ ok: false, error: "INVALID_TRANSITION" });
    expect(await feedback.triageFeedback(sub.id, { action: "CLOSE", expectedStatus: "OPEN", idempotencyKey: key(), correlationId: randomUUID() })).toMatchObject({ ok: false, error: "STATE_CONFLICT" });
  });

  // ---- Reports ----

  it("gives a neutral ack whether or not the target is eligible, and never auto-moderates", async () => {
    const owner = await createUser("USER");
    const published = await createPublishedPortfolio(owner.clerkUserId, owner.id);

    // Eligible target → report created, portfolio untouched.
    expect(await reports.submitReport({ publicSlug: owner.publicSlug.toString(), reason: "SPAM" })).toEqual({ acknowledged: true });
    const created = await prisma.abuseReport.findFirst({ where: { portfolioId: published.id }, select: { status: true } });
    expect(created?.status).toBe("OPEN");
    const pf = await prisma.portfolio.findUniqueOrThrow({ where: { id: published.id }, select: { moderationStatus: true } });
    expect(pf.moderationStatus).toBe("CLEAR"); // NOT auto-suspended

    // Unknown slug → same neutral ack, no row.
    expect(await reports.submitReport({ publicSlug: "99999999", reason: "SPAM" })).toEqual({ acknowledged: true });

    // Unpublished target → same ack, no report created.
    const draftOwner = await createUser("USER");
    await prisma.portfolio.create({ data: { ownerId: draftOwner.id, slug: `fr-${randomUUID().slice(0, 12)}` } });
    expect(await reports.submitReport({ publicSlug: draftOwner.publicSlug.toString(), reason: "SPAM" })).toEqual({ acknowledged: true });
    expect(await prisma.abuseReport.count({ where: { portfolio: { ownerId: draftOwner.id } } })).toBe(0);
  });

  it("classifies the reporter without exposing identity, and dedups an authed reporter", async () => {
    const owner = await createUser("USER");
    const reporter = await createUser("USER");
    const published = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    const admin = await createUser("ADMIN");

    await reports.submitReport({ publicSlug: owner.publicSlug.toString(), reason: "HARASSMENT", reporterUserId: reporter.id });
    await reports.submitReport({ publicSlug: owner.publicSlug.toString(), reason: "HARASSMENT", reporterUserId: reporter.id }); // dedup
    expect(await prisma.abuseReport.count({ where: { portfolioId: published.id, reporterUserId: reporter.id } })).toBe(1);

    asActor(admin.clerkUserId);
    const list = await reports.listAdminReports({ limit: 10, status: "OPEN" });
    expect(list.ok).toBe(true);
    if (list.ok) {
      const row = list.page.items.find((r) => r.portfolioId === published.id);
      expect(row?.reporter).toBe("account");
      expect(JSON.stringify(list.page)).not.toContain(reporter.id); // identity never leaked
    }
  });

  it("ACTIONED requires real enforcement via M6.3; report status never drives visibility", async () => {
    const owner = await createUser("USER");
    const admin = await createUser("ADMIN");
    const published = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    await reports.submitReport({ publicSlug: owner.publicSlug.toString(), reason: "INAPPROPRIATE" });
    const report = await prisma.abuseReport.findFirstOrThrow({ where: { portfolioId: published.id }, select: { id: true } });

    asActor(admin.clerkUserId);
    // Cannot ACTION while the portfolio is not suspended.
    expect(await reports.triageReport(report.id, { action: "ACTION", idempotencyKey: key(), correlationId: randomUUID() })).toMatchObject({ ok: false, error: "ENFORCEMENT_REQUIRED" });

    // Suspend via the real moderation service, then ACTION succeeds.
    const mod = await moderation.moderatePortfolio(published.id, { action: "SUSPEND", reason: "upheld", idempotencyKey: key(), correlationId: randomUUID() });
    expect(mod.ok).toBe(true);
    const actioned = await reports.triageReport(report.id, { action: "ACTION", idempotencyKey: key(), correlationId: randomUUID() });
    expect(actioned.ok && actioned.newState).toBe("ACTIONED");

    // Reinstating the portfolio does not erase the report history.
    await moderation.moderatePortfolio(published.id, { action: "REINSTATE", idempotencyKey: key(), correlationId: randomUUID() });
    expect(await prisma.abuseReport.count({ where: { id: report.id, status: "ACTIONED" } })).toBe(1);
  });

  it("dismissing a report does not change portfolio moderation", async () => {
    const owner = await createUser("USER");
    const admin = await createUser("ADMIN");
    const published = await createPublishedPortfolio(owner.clerkUserId, owner.id);
    await reports.submitReport({ publicSlug: owner.publicSlug.toString(), reason: "OTHER" });
    const report = await prisma.abuseReport.findFirstOrThrow({ where: { portfolioId: published.id }, select: { id: true } });

    asActor(admin.clerkUserId);
    const dismissed = await reports.triageReport(report.id, { action: "DISMISS", resolutionNote: "not a violation", idempotencyKey: key(), correlationId: randomUUID() });
    expect(dismissed.ok && dismissed.newState).toBe("DISMISSED");
    const pf = await prisma.portfolio.findUniqueOrThrow({ where: { id: published.id }, select: { moderationStatus: true } });
    expect(pf.moderationStatus).toBe("CLEAR");
  });

  it("revokes triage access mid-session when the actor's role changes", async () => {
    const admin = await createUser("ADMIN");
    asActor(admin.clerkUserId);
    expect((await reports.listAdminReports({ limit: 1 })).ok).toBe(true);
    await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    expect((await reports.listAdminReports({ limit: 1 })).ok).toBe(false);
  });
});
