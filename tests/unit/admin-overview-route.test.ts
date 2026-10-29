// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/authorization", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/admin/overview", () => ({ getAdminOverview: vi.fn() }));
vi.mock("@/lib/audit/audit-log", () => ({ recordAuthorizationFailure: vi.fn() }));

import { GET } from "@/app/api/admin/overview/route";
import { getAdminOverview } from "@/lib/admin/overview";
import { requirePermission } from "@/lib/auth/authorization";
import { recordAuthorizationFailure } from "@/lib/audit/audit-log";

const requireMock = vi.mocked(requirePermission);
const overviewMock = vi.mocked(getAdminOverview);
const auditMock = vi.mocked(recordAuthorizationFailure);

const req = () => new Request("http://t/api/admin/overview");

describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    requireMock.mockReset();
    overviewMock.mockReset();
    auditMock.mockReset();
  });

  it("401 for anonymous callers and does not audit anonymous noise", async () => {
    requireMock.mockResolvedValue({ ok: false, reason: "UNAUTHENTICATED", status: 401 });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-correlation-id")).toBeTruthy();
    expect(auditMock).not.toHaveBeenCalled();
    expect(overviewMock).not.toHaveBeenCalled();
  });

  it("403 for an authenticated non-admin and records a denied audit event", async () => {
    requireMock.mockResolvedValue({
      ok: false,
      reason: "FORBIDDEN",
      status: 403,
      actorUserId: "u-9",
    });
    const res = await GET(req());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.overview.read.denied", actorUserId: "u-9" }),
    );
    expect(overviewMock).not.toHaveBeenCalled();
  });

  it("200 with aggregate counts for an authorized admin", async () => {
    requireMock.mockResolvedValue({
      ok: true,
      actor: { userId: "u-1", clerkUserId: "c", role: "SUPER_ADMIN", email: null, name: null },
    });
    overviewMock.mockResolvedValue({ totalUsers: 5, activePortfolios: 3, publishedPortfolios: 2 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { totalUsers: 5, activePortfolios: 3, publishedPortfolios: 2 },
    });
  });
});
