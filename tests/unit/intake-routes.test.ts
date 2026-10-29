// @vitest-environment node
import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/admin/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/feedback/service", () => ({ submitFeedback: vi.fn(), FEEDBACK_MESSAGE_MAX: 4000 }));
vi.mock("@/lib/reports/service", () => ({ submitReport: vi.fn(), REPORT_DETAILS_MAX: 2000 }));
vi.mock("@/lib/trust/anti-spam", () => ({
  anonymousNetworkKey: () => "anon:test",
  verifyTurnstile: vi.fn(),
}));
vi.mock("@/lib/env/security", () => ({ isStrictSecurity: vi.fn(() => false) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { POST as feedbackRoute } from "@/app/api/feedback/route";
import { POST as reportRoute } from "@/app/api/reports/route";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { submitFeedback } from "@/lib/feedback/service";
import { submitReport } from "@/lib/reports/service";
import { verifyTurnstile } from "@/lib/trust/anti-spam";
import { isStrictSecurity } from "@/lib/env/security";
import { prisma } from "@/lib/db/prisma";

const authMock = vi.mocked(auth);
const strictMock = vi.mocked(isStrictSecurity);
const limitMock = vi.mocked(enforceRateLimit);
const feedbackMock = vi.mocked(submitFeedback);
const reportMock = vi.mocked(submitReport);
const turnstileMock = vi.mocked(verifyTurnstile);
const findUser = vi.mocked(prisma.user.findUnique);

const post = (body: unknown) =>
  new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  limitMock.mockResolvedValue({ allowed: true });
  strictMock.mockReturnValue(false);
});

describe("POST /api/feedback", () => {
  const body = { category: "BUG", message: "something broke" };

  it("401 for anonymous", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    expect((await feedbackRoute(post(body))).status).toBe(401);
    expect(feedbackMock).not.toHaveBeenCalled();
  });

  it("429 when rate limited", async () => {
    authMock.mockResolvedValue({ userId: "c" } as never);
    limitMock.mockResolvedValue({ allowed: false, reason: "RATE_LIMITED", retryAfterSeconds: 5 });
    expect((await feedbackRoute(post(body))).status).toBe(429);
  });

  it("400 for an invalid category", async () => {
    authMock.mockResolvedValue({ userId: "c" } as never);
    expect((await feedbackRoute(post({ category: "NONSENSE", message: "x" }))).status).toBe(400);
  });

  it("403 for a suspended account", async () => {
    authMock.mockResolvedValue({ userId: "c" } as never);
    feedbackMock.mockResolvedValue({ ok: false, error: "ACCOUNT_SUSPENDED" });
    expect((await feedbackRoute(post(body))).status).toBe(403);
  });

  it("200 with no internal id on success", async () => {
    authMock.mockResolvedValue({ userId: "c" } as never);
    feedbackMock.mockResolvedValue({ ok: true, id: "secret-feedback-id", deduped: false });
    const res = await feedbackRoute(post(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { received: true } });
    expect(JSON.stringify(json)).not.toContain("secret-feedback-id");
  });
});

describe("POST /api/reports", () => {
  const body = { publicSlug: "10482", reason: "SPAM" };

  it("returns a neutral ack and never calls through on rate limit", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    limitMock.mockResolvedValue({ allowed: false, reason: "RATE_LIMITED", retryAfterSeconds: 60 });
    expect((await reportRoute(post(body))).status).toBe(429);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("422 when an anonymous caller fails a configured Turnstile", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    turnstileMock.mockResolvedValue({ configured: true, ok: false });
    const res = await reportRoute(post(body));
    expect(res.status).toBe(422);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("accepts an anonymous report when Turnstile is unconfigured in RELAXED mode", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    strictMock.mockReturnValue(false);
    turnstileMock.mockResolvedValue({ configured: false, ok: true });
    reportMock.mockResolvedValue({ acknowledged: true });
    const res = await reportRoute(post(body));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { received: true } });
    expect(reportMock).toHaveBeenCalledWith(expect.objectContaining({ publicSlug: "10482", reporterUserId: null }));
  });

  it("fails CLOSED (503) for an anonymous report when Turnstile is unconfigured in STRICT mode", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    strictMock.mockReturnValue(true);
    turnstileMock.mockResolvedValue({ configured: false, ok: true });
    const res = await reportRoute(post(body));
    expect(res.status).toBe(503);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("attributes an ACTIVE authenticated reporter and skips Turnstile", async () => {
    authMock.mockResolvedValue({ userId: "clerk_u" } as never);
    findUser.mockResolvedValue({ id: "u-1", status: "ACTIVE" } as never);
    reportMock.mockResolvedValue({ acknowledged: true });
    const res = await reportRoute(post(body));
    expect(res.status).toBe(200);
    expect(turnstileMock).not.toHaveBeenCalled();
    expect(reportMock).toHaveBeenCalledWith(expect.objectContaining({ reporterUserId: "u-1" }));
  });
});
