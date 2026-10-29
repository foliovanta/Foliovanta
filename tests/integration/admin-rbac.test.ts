import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AuthzModule from "@/lib/auth/authorization";
import type * as AuditModule from "@/lib/audit/audit-log";
import type * as OverviewModule from "@/lib/admin/overview";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
const authMock = vi.mocked(auth);

describe.skipIf(!optedIn)("admin RBAC + audit (integration)", () => {
  let authz: typeof AuthzModule;
  let audit: typeof AuditModule;
  let overview: typeof OverviewModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createUser(role: "USER" | "ADMIN" | "SUPER_ADMIN", status: "ACTIVE" | "SUSPENDED" | "DELETION_PENDING" = "ACTIVE") {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, role, status, email: `${randomUUID().slice(0, 8)}@test.dev` },
      select: { id: true, clerkUserId: true },
    });
    createdUserIds.push(user.id);
    return user;
  }
  const signedInAs = (clerkUserId: string | null) =>
    authMock.mockResolvedValue({ userId: clerkUserId } as never);

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    authz = await import("@/lib/auth/authorization");
    audit = await import("@/lib/audit/audit-log");
    overview = await import("@/lib/admin/overview");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  beforeEach(() => authMock.mockReset());

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      // Audit rows are append-only (the FK sets actorUserId NULL on user delete);
      // we never delete them. Only remove the users/portfolios we created.
      await prisma.portfolio.updateMany({
        where: { ownerId: { in: createdUserIds } },
        data: { activeVersionId: null },
      });
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("resolves the role from the database, not the client", async () => {
    const admin = await createUser("ADMIN");
    signedInAs(admin.clerkUserId);
    const result = await authz.resolveAdminActor();
    expect(result).toMatchObject({ ok: true, actor: { userId: admin.id, role: "ADMIN" } });
  });

  it("denies a USER, a suspended admin, a deletion-pending admin, and a missing row", async () => {
    const user = await createUser("USER");
    signedInAs(user.clerkUserId);
    expect((await authz.resolveAdminActor()).ok).toBe(false);

    const suspended = await createUser("SUPER_ADMIN", "SUSPENDED");
    signedInAs(suspended.clerkUserId);
    expect(await authz.resolveAdminActor()).toMatchObject({ reason: "ACCOUNT_INACTIVE" });

    const pending = await createUser("ADMIN", "DELETION_PENDING");
    signedInAs(pending.clerkUserId);
    expect(await authz.resolveAdminActor()).toMatchObject({ reason: "ACCOUNT_INACTIVE" });

    signedInAs(`test_${randomUUID()}`); // authenticated, no DB row
    expect(await authz.resolveAdminActor()).toMatchObject({ reason: "NOT_SYNCED" });
  });

  it("revokes access mid-session when the DB role changes (no sign-out)", async () => {
    const admin = await createUser("SUPER_ADMIN");
    signedInAs(admin.clerkUserId);
    expect((await authz.requirePermission("admin.audit.read")).ok).toBe(true);

    // Operator revokes the role in the database; the SAME session loses access.
    await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    expect((await authz.requirePermission("admin.overview.read")).ok).toBe(false);
  });

  it("blocks vertical escalation: ADMIN cannot use a SUPER_ADMIN-only permission", async () => {
    const admin = await createUser("ADMIN");
    signedInAs(admin.clerkUserId);
    expect((await authz.requirePermission("admin.overview.read")).ok).toBe(true);
    expect((await authz.requirePermission("admin.audit.read")).ok).toBe(false);
    expect((await authz.requirePermission("admin.roles.manage")).ok).toBe(false);
  });

  it("writes an immutable audit record that cannot be updated or deleted", async () => {
    const admin = await createUser("SUPER_ADMIN");
    await audit.recordAudit({
      action: "test.audit.integrity",
      actorUserId: admin.id,
      targetType: "user",
      targetId: admin.id,
      metadata: { note: "integrity check" },
    });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "test.audit.integrity", actorUserId: admin.id },
      select: { id: true },
    });
    // The database trigger forbids both UPDATE and DELETE.
    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/append-only/i);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/i);
  });

  it("redacts sensitive metadata before persisting", async () => {
    const admin = await createUser("SUPER_ADMIN");
    await audit.recordAudit({
      action: "test.audit.redaction",
      actorUserId: admin.id,
      metadata: { reason: "ok", sessionToken: "secret-value" },
    });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "test.audit.redaction", actorUserId: admin.id },
      select: { metadata: true },
    });
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.reason).toBe("ok");
    expect(meta.sessionToken).toBe("[redacted]");
  });

  it("couples a transactional audit write to its mutation (both commit or neither)", async () => {
    const admin = await createUser("ADMIN");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: admin.id }, data: { role: "SUPER_ADMIN" } });
      await audit.recordAudit(
        { action: "test.audit.tx", actorUserId: admin.id, targetType: "user", targetId: admin.id },
        tx,
      );
    });
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: admin.id }, select: { role: true } });
    expect(updated.role).toBe("SUPER_ADMIN");
    expect(
      await prisma.auditLog.count({ where: { action: "test.audit.tx", actorUserId: admin.id } }),
    ).toBe(1);
  });

  it("counts overview aggregates as deltas on seeded data", async () => {
    const before = await overview.getAdminOverview();
    const owner = await createUser("USER");
    const portfolio = await prisma.portfolio.create({
      data: { ownerId: owner.id, slug: `admin-${randomUUID().slice(0, 10)}` },
      select: { id: true },
    });
    const after = await overview.getAdminOverview();
    expect(after.totalUsers).toBe(before.totalUsers + 1);
    expect(after.activePortfolios).toBe(before.activePortfolios + 1);
    // Not published yet, so the published count is unchanged.
    expect(after.publishedPortfolios).toBe(before.publishedPortfolios);
    void portfolio;
  });
});
