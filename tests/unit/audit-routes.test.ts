// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/admin/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/admin/audit-explorer", () => ({ listAuditLogs: vi.fn(), getAuditLogDetail: vi.fn() }));
vi.mock("@/lib/admin/route-helpers", () => ({ auditDenied: vi.fn() }));

import { GET as listRoute } from "@/app/api/admin/audit-logs/route";
import { GET as detailRoute } from "@/app/api/admin/audit-logs/[auditId]/route";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { getAuditLogDetail, listAuditLogs } from "@/lib/admin/audit-explorer";
import { auditDenied } from "@/lib/admin/route-helpers";

const authMock = vi.mocked(auth);
const limitMock = vi.mocked(enforceRateLimit);
const listMock = vi.mocked(listAuditLogs);
const detailMock = vi.mocked(getAuditLogDetail);
const auditMock = vi.mocked(auditDenied);

const AID = randomUUID();
const req = (q = "") => new Request(`http://t/api/admin/audit-logs${q}`);

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "super" } as never);
  limitMock.mockResolvedValue({ allowed: true });
});

describe("GET /api/admin/audit-logs", () => {
  it("401 for anonymous (service returns UNAUTHENTICATED)", async () => {
    listMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "UNAUTHENTICATED", status: 401 } });
    expect((await listRoute(req())).status).toBe(401);
  });

  it("403 + audit for a non-SUPER_ADMIN", async () => {
    listMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "FORBIDDEN", status: 403, actorUserId: "u" } });
    const res = await listRoute(req());
    expect(res.status).toBe(403);
    expect(auditMock).toHaveBeenCalledWith("admin.audit.read.denied", expect.anything(), expect.any(String));
  });

  it("400 for a bad family and for a tampered cursor", async () => {
    expect((await listRoute(req("?family=NONSENSE"))).status).toBe(400);
    expect((await listRoute(req("?cursor=tampered"))).status).toBe(400);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("200 with a page on success", async () => {
    listMock.mockResolvedValue({ ok: true, page: { items: [], nextCursor: null } });
    const res = await listRoute(req("?family=moderation&limit=10"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { items: [], nextCursor: null } });
  });
});

describe("GET /api/admin/audit-logs/[auditId]", () => {
  const call = () => detailRoute(req(), { params: Promise.resolve({ auditId: AID }) });

  it("403 on denial, 404 missing, 200 success", async () => {
    detailMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "FORBIDDEN", status: 403 } });
    expect((await call()).status).toBe(403);

    detailMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    expect((await call()).status).toBe(404);

    detailMock.mockResolvedValue({
      ok: true,
      entry: { id: AID, createdAt: "2026-01-01T00:00:00.000Z", action: "x", family: "other", outcome: "SUCCESS", actorUserId: null, targetType: null, targetId: null, correlationId: null, summary: "", metadata: {}, actorLabel: null },
    });
    expect((await call()).status).toBe(200);
  });
});
