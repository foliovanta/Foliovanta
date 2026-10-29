// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/admin/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/admin/moderation", () => ({ moderatePortfolio: vi.fn(), moderateAccount: vi.fn() }));
vi.mock("@/lib/admin/route-helpers", () => ({ auditDenied: vi.fn() }));

import { POST as portfolioModeration } from "@/app/api/admin/portfolios/[portfolioId]/moderation/route";
import { POST as accountModeration } from "@/app/api/admin/users/[userId]/moderation/route";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { moderateAccount, moderatePortfolio } from "@/lib/admin/moderation";
import { auditDenied } from "@/lib/admin/route-helpers";

const authMock = vi.mocked(auth);
const limitMock = vi.mocked(enforceRateLimit);
const portfolioMock = vi.mocked(moderatePortfolio);
const accountMock = vi.mocked(moderateAccount);
const auditMock = vi.mocked(auditDenied);

const PID = randomUUID();
const UID = randomUUID();
const post = (body: unknown) =>
  new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const pfParams = { params: Promise.resolve({ portfolioId: PID }) };
const okBody = { action: "SUSPEND", reason: "spam listing", idempotencyKey: "idem-key-12345" };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "clerk_admin" } as never);
  limitMock.mockResolvedValue({ allowed: true });
});

describe("POST /api/admin/portfolios/[portfolioId]/moderation", () => {
  it("fails CLOSED (503) when the mutation limiter is unavailable", async () => {
    limitMock.mockResolvedValue({ allowed: false, reason: "UNAVAILABLE" });
    const res = await portfolioModeration(post(okBody), pfParams);
    expect(res.status).toBe(503);
    expect(portfolioMock).not.toHaveBeenCalled();
  });

  it("429 when rate limited", async () => {
    limitMock.mockResolvedValue({ allowed: false, reason: "RATE_LIMITED", retryAfterSeconds: 10 });
    const res = await portfolioModeration(post(okBody), pfParams);
    expect(res.status).toBe(429);
  });

  it("400 for an invalid body (bad action / missing idempotency key)", async () => {
    expect((await portfolioModeration(post({ action: "NUKE", idempotencyKey: "k" }), pfParams)).status).toBe(400);
    expect((await portfolioModeration(post({ action: "SUSPEND" }), pfParams)).status).toBe(400);
    expect(portfolioMock).not.toHaveBeenCalled();
  });

  it("403 + audit when the service denies authorization", async () => {
    portfolioMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "FORBIDDEN", status: 403, actorUserId: "u" } });
    const res = await portfolioModeration(post(okBody), pfParams);
    expect(res.status).toBe(403);
    expect(auditMock).toHaveBeenCalledWith("moderation.portfolio.denied", expect.anything(), expect.any(String));
  });

  it("maps domain errors to statuses", async () => {
    portfolioMock.mockResolvedValue({ ok: false, error: "REASON_REQUIRED" });
    expect((await portfolioModeration(post(okBody), pfParams)).status).toBe(422);
    portfolioMock.mockResolvedValue({ ok: false, error: "INVALID_TRANSITION" });
    expect((await portfolioModeration(post(okBody), pfParams)).status).toBe(409);
    portfolioMock.mockResolvedValue({ ok: false, error: "STATE_CONFLICT" });
    expect((await portfolioModeration(post(okBody), pfParams)).status).toBe(409);
    portfolioMock.mockResolvedValue({ ok: false, error: "IDEMPOTENCY_CONFLICT" });
    expect((await portfolioModeration(post(okBody), pfParams)).status).toBe(409);
    portfolioMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    expect((await portfolioModeration(post(okBody), pfParams)).status).toBe(404);
  });

  it("200 on success and passes the correlation id as the service correlationId", async () => {
    portfolioMock.mockResolvedValue({
      ok: true, targetType: "portfolio", targetId: PID, previousState: "CLEAR", newState: "SUSPENDED", changed: true, replayed: false,
    });
    const res = await portfolioModeration(post(okBody), pfParams);
    expect(res.status).toBe(200);
    expect(portfolioMock).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ action: "SUSPEND", reason: "spam listing", idempotencyKey: "idem-key-12345", correlationId: expect.any(String) }),
    );
  });
});

describe("POST /api/admin/users/[userId]/moderation", () => {
  const params = { params: Promise.resolve({ userId: UID }) };

  it("403 SELF_TARGET", async () => {
    accountMock.mockResolvedValue({ ok: false, error: "SELF_TARGET" });
    expect((await accountModeration(post(okBody), params)).status).toBe(403);
  });

  it("403 ADMIN_TARGET", async () => {
    accountMock.mockResolvedValue({ ok: false, error: "ADMIN_TARGET" });
    expect((await accountModeration(post(okBody), params)).status).toBe(403);
  });

  it("200 on success", async () => {
    accountMock.mockResolvedValue({
      ok: true, targetType: "user", targetId: UID, previousState: "ACTIVE", newState: "SUSPENDED", changed: true, replayed: false,
    });
    expect((await accountModeration(post(okBody), params)).status).toBe(200);
  });
});
