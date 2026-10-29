// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/admin/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/admin/users-directory", () => ({
  listAdminUsers: vi.fn(),
  getAdminUserDetail: vi.fn(),
}));
vi.mock("@/lib/admin/portfolios-directory", () => ({
  listAdminPortfolios: vi.fn(),
  getAdminPortfolioDetail: vi.fn(),
}));
vi.mock("@/lib/admin/route-helpers", () => ({ auditDenied: vi.fn() }));

import { GET as usersList } from "@/app/api/admin/users/route";
import { GET as userDetail } from "@/app/api/admin/users/[userId]/route";
import { GET as portfoliosList } from "@/app/api/admin/portfolios/route";
import { GET as portfolioDetail } from "@/app/api/admin/portfolios/[portfolioId]/route";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { getAdminUserDetail, listAdminUsers } from "@/lib/admin/users-directory";
import { getAdminPortfolioDetail, listAdminPortfolios } from "@/lib/admin/portfolios-directory";
import { auditDenied } from "@/lib/admin/route-helpers";
import { encodeCursor } from "@/lib/admin/pagination";

const authMock = vi.mocked(auth);
const limitMock = vi.mocked(enforceRateLimit);
const listUsersMock = vi.mocked(listAdminUsers);
const userDetailMock = vi.mocked(getAdminUserDetail);
const listPfMock = vi.mocked(listAdminPortfolios);
const pfDetailMock = vi.mocked(getAdminPortfolioDetail);
const auditMock = vi.mocked(auditDenied);

const PID = randomUUID();
const req = (query = "") => new Request(`http://t/api/admin/users${query}`);
const emptyPage = { items: [], nextCursor: null };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "clerk_admin" } as never);
  limitMock.mockResolvedValue({ allowed: true });
});

describe("GET /api/admin/users", () => {
  it("429 when rate limited (before the service)", async () => {
    limitMock.mockResolvedValue({ allowed: false, reason: "RATE_LIMITED", retryAfterSeconds: 30 });
    const res = await usersList(req());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("400 on an invalid query parameter", async () => {
    const res = await usersList(req("?role=HACKER"));
    expect(res.status).toBe(400);
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("400 on a tampered cursor, without calling the service", async () => {
    const res = await usersList(req("?cursor=not-valid"));
    expect(res.status).toBe(400);
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("passes a valid cursor through to the service", async () => {
    listUsersMock.mockResolvedValue({ ok: true, page: emptyPage });
    const cursor = encodeCursor({ v: "2026-01-01T00:00:00.000Z", id: PID });
    await usersList(req(`?cursor=${cursor}`));
    expect(listUsersMock).toHaveBeenCalledWith(expect.objectContaining({ cursor: { v: "2026-01-01T00:00:00.000Z", id: PID } }));
  });

  it("403 and audits an authenticated denial", async () => {
    listUsersMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "FORBIDDEN", status: 403, actorUserId: "u-9" } });
    const res = await usersList(req());
    expect(res.status).toBe(403);
    expect(auditMock).toHaveBeenCalledWith("admin.users.read.denied", expect.objectContaining({ reason: "FORBIDDEN" }), expect.any(String));
  });

  it("401 for an anonymous caller", async () => {
    listUsersMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "UNAUTHENTICATED", status: 401 } });
    const res = await usersList(req());
    expect(res.status).toBe(401);
  });

  it("200 with a page on success", async () => {
    listUsersMock.mockResolvedValue({ ok: true, page: { items: [{ id: "u1" } as never], nextCursor: null } });
    const res = await usersList(req("?role=ADMIN&status=ACTIVE&q=ada&limit=10"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { items: [{ id: "u1" }], nextCursor: null } });
  });
});

describe("GET /api/admin/users/[userId]", () => {
  const call = () => userDetail(req(), { params: Promise.resolve({ userId: PID }) });

  it("403 + audit on denial", async () => {
    userDetailMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "FORBIDDEN", status: 403 } });
    expect((await call()).status).toBe(403);
    expect(auditMock).toHaveBeenCalled();
  });

  it("404 for a missing record (no audit)", async () => {
    userDetailMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    expect((await call()).status).toBe(404);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("200 for an authorized read", async () => {
    userDetailMock.mockResolvedValue({ ok: true, user: { id: PID } as never });
    expect((await call()).status).toBe(200);
  });
});

describe("GET /api/admin/portfolios", () => {
  it("403 + audit on denial", async () => {
    listPfMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "FORBIDDEN", status: 403, actorUserId: "u-1" } });
    const res = await portfoliosList(new Request("http://t/api/admin/portfolios"));
    expect(res.status).toBe(403);
    expect(auditMock).toHaveBeenCalledWith("admin.portfolios.read.denied", expect.anything(), expect.any(String));
  });

  it("200 on success", async () => {
    listPfMock.mockResolvedValue({ ok: true, page: emptyPage });
    const res = await portfoliosList(new Request("http://t/api/admin/portfolios?sort=updatedAt"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/portfolios/[portfolioId]", () => {
  const call = () => portfolioDetail(new Request("http://t"), { params: Promise.resolve({ portfolioId: PID }) });

  it("404 for a missing record", async () => {
    pfDetailMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    expect((await call()).status).toBe(404);
  });

  it("200 for an authorized read", async () => {
    pfDetailMock.mockResolvedValue({ ok: true, portfolio: { id: PID } as never });
    expect((await call()).status).toBe(200);
  });
});
