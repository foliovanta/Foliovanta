import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AuditModule from "@/lib/admin/audit-explorer";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
const authMock = vi.mocked(auth);

describe.skipIf(!optedIn)("audit explorer (integration)", () => {
  let explorer: typeof AuditModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];
  const token = `cid-${randomUUID()}`; // unique correlation id to scope this run

  async function createUser(role: "USER" | "ADMIN" | "SUPER_ADMIN" = "SUPER_ADMIN", status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const user = await prisma.user.create({ data: { clerkUserId: `test_${randomUUID()}`, role, status, name: "Auditor" }, select: { id: true, clerkUserId: true } });
    createdUserIds.push(user.id);
    return user;
  }
  const asActor = (clerkUserId: string | null) => authMock.mockResolvedValue({ userId: clerkUserId } as never);

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    explorer = await import("@/lib/admin/audit-explorer");
    ({ prisma } = await import("@/lib/db/prisma"));
  });
  beforeEach(() => authMock.mockReset());

  afterAll(async () => {
    if (!prisma) return;
    // audit_logs are append-only (cannot be deleted); only clean the users we made.
    if (createdUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("allows SUPER_ADMIN and denies ADMIN / USER / anonymous / suspended / revoked", async () => {
    const superAdmin = await createUser("SUPER_ADMIN");
    const admin = await createUser("ADMIN");
    const user = await createUser("USER");
    const suspended = await createUser("SUPER_ADMIN", "SUSPENDED");

    asActor(superAdmin.clerkUserId);
    expect((await explorer.listAuditLogs({ limit: 5 })).ok).toBe(true);

    asActor(admin.clerkUserId);
    expect((await explorer.listAuditLogs({ limit: 5 })).ok).toBe(false);
    asActor(user.clerkUserId);
    expect((await explorer.listAuditLogs({ limit: 5 })).ok).toBe(false);
    asActor(null);
    expect((await explorer.listAuditLogs({ limit: 5 })).ok).toBe(false);
    asActor(suspended.clerkUserId);
    expect((await explorer.listAuditLogs({ limit: 5 })).ok).toBe(false);

    // Mid-session revocation.
    asActor(superAdmin.clerkUserId);
    expect((await explorer.listAuditLogs({ limit: 5 })).ok).toBe(true);
    await prisma.user.update({ where: { id: superAdmin.id }, data: { role: "ADMIN" } });
    expect((await explorer.listAuditLogs({ limit: 5 })).ok).toBe(false);
  });

  it("paginates stably across identical timestamps and filters correctly", async () => {
    const superAdmin = await createUser("SUPER_ADMIN");
    const sameTime = new Date("2030-01-01T00:00:00.000Z");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const row = await prisma.auditLog.create({
        data: { action: "moderation.portfolio.suspend", actorUserId: superAdmin.id, targetType: "portfolio", targetId: randomUUID(), outcome: "SUCCESS", correlationId: token, createdAt: sameTime, metadata: { fromState: "CLEAR", toState: "SUSPENDED", reason: "r" } },
        select: { id: true },
      });
      ids.push(row.id);
    }

    asActor(superAdmin.clerkUserId);
    const seen: string[] = [];
    let cursor: AuditModule.ListAuditParams["cursor"];
    for (let guard = 0; guard < 10; guard++) {
      const page = await explorer.listAuditLogs({ limit: 2, correlationId: token, ...(cursor ? { cursor } : {}) });
      if (!page.ok) throw new Error("list failed");
      seen.push(...page.page.items.map((i) => i.id));
      if (!page.page.nextCursor) break;
      cursor = JSON.parse(Buffer.from(page.page.nextCursor, "base64url").toString("utf8"));
    }
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect([...seen].sort()).toEqual([...ids].sort()); // no omissions, all five

    // Family + action filters.
    const byFamily = await explorer.listAuditLogs({ limit: 50, family: "moderation", correlationId: token });
    expect(byFamily.ok && byFamily.page.items.every((i) => i.family === "moderation")).toBe(true);
  });

  it("redacts metadata to the safe allowlist in list and detail", async () => {
    const superAdmin = await createUser("SUPER_ADMIN");
    const row = await prisma.auditLog.create({
      data: {
        action: "moderation.portfolio.suspend",
        actorUserId: superAdmin.id,
        targetType: "portfolio",
        targetId: randomUUID(),
        outcome: "SUCCESS",
        correlationId: `${token}-redact`,
        metadata: { fromState: "CLEAR", toState: "SUSPENDED", reason: "ok", sessionToken: "SECRET", draftBody: "private" },
      },
      select: { id: true },
    });

    asActor(superAdmin.clerkUserId);
    const detail = await explorer.getAuditLogDetail(row.id);
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      expect(detail.entry.metadata).toEqual({ fromState: "CLEAR", toState: "SUSPENDED", reason: "ok" });
      const json = JSON.stringify(detail.entry);
      expect(json).not.toContain("SECRET");
      expect(json).not.toContain("private");
      expect(detail.entry.actorLabel).toBe("Auditor");
    }
  });

  it("detail returns NOT_FOUND for missing/invalid ids and reads never mutate", async () => {
    const superAdmin = await createUser("SUPER_ADMIN");
    asActor(superAdmin.clerkUserId);
    expect(await explorer.getAuditLogDetail(randomUUID())).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await explorer.getAuditLogDetail("not-a-uuid")).toEqual({ ok: false, error: "NOT_FOUND" });

    const before = await prisma.auditLog.count({ where: { correlationId: token } });
    await explorer.listAuditLogs({ limit: 5, correlationId: token });
    const after = await prisma.auditLog.count({ where: { correlationId: token } });
    expect(after).toBe(before); // reads never create/delete
  });

  it("keeps audit records append-only (trigger blocks update/delete)", async () => {
    const superAdmin = await createUser("SUPER_ADMIN");
    const row = await prisma.auditLog.create({
      data: { action: "feedback.resolved", actorUserId: superAdmin.id, targetType: "feedback", targetId: randomUUID(), outcome: "SUCCESS", correlationId: `${token}-immut`, metadata: { fromState: "OPEN", toState: "RESOLVED" } },
      select: { id: true },
    });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/i);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/i);
  });
});
