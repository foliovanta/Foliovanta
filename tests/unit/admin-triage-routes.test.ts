// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/admin/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/feedback/service", () => ({ triageFeedback: vi.fn(), listAdminFeedback: vi.fn(), getAdminFeedbackDetail: vi.fn() }));
vi.mock("@/lib/reports/service", () => ({ triageReport: vi.fn(), listAdminReports: vi.fn(), getAdminReportDetail: vi.fn() }));
vi.mock("@/lib/admin/route-helpers", () => ({ auditDenied: vi.fn() }));

import { POST as feedbackTriage } from "@/app/api/admin/feedback/[id]/triage/route";
import { POST as reportTriage } from "@/app/api/admin/reports/[id]/triage/route";
import { GET as feedbackList } from "@/app/api/admin/feedback/route";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { triageFeedback, listAdminFeedback } from "@/lib/feedback/service";
import { triageReport } from "@/lib/reports/service";
import { auditDenied } from "@/lib/admin/route-helpers";

const authMock = vi.mocked(auth);
const limitMock = vi.mocked(enforceRateLimit);
const triageFbMock = vi.mocked(triageFeedback);
const listFbMock = vi.mocked(listAdminFeedback);
const triageRpMock = vi.mocked(triageReport);
const auditMock = vi.mocked(auditDenied);

const ID = randomUUID();
const post = (body: unknown) =>
  new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: ID }) };
const okBody = { action: "REVIEW", idempotencyKey: "idem-key-abc123" };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "admin" } as never);
  limitMock.mockResolvedValue({ allowed: true });
});

describe("feedback list route", () => {
  it("403 + audit on denial, 200 on success", async () => {
    listFbMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "FORBIDDEN", status: 403, actorUserId: "u" } });
    expect((await feedbackList(new Request("http://t/api/admin/feedback"))).status).toBe(403);
    expect(auditMock).toHaveBeenCalledWith("admin.feedback.read.denied", expect.anything(), expect.any(String));

    listFbMock.mockResolvedValue({ ok: true, page: { items: [], nextCursor: null } });
    expect((await feedbackList(new Request("http://t/api/admin/feedback"))).status).toBe(200);
  });
});

describe("feedback triage route", () => {
  it("mutation limiter fail-closed → 503", async () => {
    limitMock.mockResolvedValue({ allowed: false, reason: "UNAVAILABLE" });
    expect((await feedbackTriage(post(okBody), params)).status).toBe(503);
    expect(triageFbMock).not.toHaveBeenCalled();
  });

  it("400 invalid body, 403 denial, 404 not found, 409 invalid transition, 200 ok", async () => {
    expect((await feedbackTriage(post({ action: "BOGUS", idempotencyKey: "k" }), params)).status).toBe(400);

    triageFbMock.mockResolvedValue({ ok: false, failure: { ok: false, reason: "FORBIDDEN", status: 403 } });
    expect((await feedbackTriage(post(okBody), params)).status).toBe(403);
    expect(auditMock).toHaveBeenCalledWith("admin.feedback.triage.denied", expect.anything(), expect.any(String));

    triageFbMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    expect((await feedbackTriage(post(okBody), params)).status).toBe(404);

    triageFbMock.mockResolvedValue({ ok: false, error: "INVALID_TRANSITION" });
    expect((await feedbackTriage(post(okBody), params)).status).toBe(409);

    triageFbMock.mockResolvedValue({ ok: true, id: ID, previousState: "OPEN", newState: "IN_REVIEW", changed: true, replayed: false });
    expect((await feedbackTriage(post(okBody), params)).status).toBe(200);
  });
});

describe("report triage route", () => {
  it("409 ENFORCEMENT_REQUIRED carries a helpful message", async () => {
    triageRpMock.mockResolvedValue({ ok: false, error: "ENFORCEMENT_REQUIRED" });
    const res = await reportTriage(post({ action: "ACTION", idempotencyKey: "idem-key-xyz987" }), params);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "ENFORCEMENT_REQUIRED" } });
  });

  it("200 on a valid transition", async () => {
    triageRpMock.mockResolvedValue({ ok: true, id: ID, previousState: "OPEN", newState: "IN_REVIEW", changed: true, replayed: false });
    expect((await reportTriage(post(okBody), params)).status).toBe(200);
  });
});
