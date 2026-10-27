// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/publishing/publish-service", () => ({
  publishPortfolio: vi.fn(),
  unpublishPortfolio: vi.fn(),
}));

import { POST as publishRoute } from "@/app/api/portfolios/[portfolioId]/publish/route";
import { POST as unpublishRoute } from "@/app/api/portfolios/[portfolioId]/unpublish/route";
import { publishPortfolio, unpublishPortfolio } from "@/lib/publishing/publish-service";

const authMock = vi.mocked(auth);
const publishMock = vi.mocked(publishPortfolio);
const unpublishMock = vi.mocked(unpublishPortfolio);

const PID = randomUUID();
const params = (portfolioId: string) => ({ params: Promise.resolve({ portfolioId }) });
const post = (body: unknown) =>
  new Request("http://t", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/portfolios/[portfolioId]/publish", () => {
  beforeEach(() => {
    authMock.mockReset();
    publishMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const res = await publishRoute(post({ expectedRevision: "0" }), params(PID));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("400 for an invalid portfolio id", async () => {
    const res = await publishRoute(post({ expectedRevision: "0" }), params("bad"));
    expect(res.status).toBe(400);
  });

  it("400 for a missing expectedRevision", async () => {
    const res = await publishRoute(post({}), params(PID));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("200 with typed metadata on success", async () => {
    publishMock.mockResolvedValue({
      ok: true,
      versionNumber: 1,
      publicationStatus: "PUBLISHED",
      publishedAt: new Date("2026-01-02T03:04:05.000Z"),
      revision: BigInt(5),
      contentHash: "deadbeef",
      created: true,
    });
    const res = await publishRoute(post({ expectedRevision: "5" }), params(PID));
    expect(res.status).toBe(200);
    expect(publishMock).toHaveBeenCalledWith("user_1", PID, BigInt(5));
    await expect(res.json()).resolves.toEqual({
      data: {
        versionNumber: 1,
        publicationStatus: "PUBLISHED",
        publishedAt: "2026-01-02T03:04:05.000Z",
        revision: "5",
        contentHash: "deadbeef",
        created: true,
      },
    });
  });

  it("409 on a stale revision", async () => {
    publishMock.mockResolvedValue({ ok: false, error: "REVISION_CONFLICT" });
    const res = await publishRoute(post({ expectedRevision: "1" }), params(PID));
    expect(res.status).toBe(409);
  });

  it("422 with field-addressable issues when not ready", async () => {
    publishMock.mockResolvedValue({
      ok: false,
      error: "NOT_READY",
      issues: [
        { field: "profile.displayName", code: "REQUIRED", message: "A display name is required." },
      ],
    });
    const res = await publishRoute(post({ expectedRevision: "0" }), params(PID));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "NOT_READY", details: [{ field: "profile.displayName", code: "REQUIRED" }] },
    });
  });

  it("403 when the portfolio is suspended", async () => {
    publishMock.mockResolvedValue({ ok: false, error: "PORTFOLIO_SUSPENDED" });
    const res = await publishRoute(post({ expectedRevision: "0" }), params(PID));
    expect(res.status).toBe(403);
  });

  it("404 when not found / unowned", async () => {
    publishMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await publishRoute(post({ expectedRevision: "0" }), params(PID));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/portfolios/[portfolioId]/unpublish", () => {
  beforeEach(() => {
    authMock.mockReset();
    unpublishMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const res = await unpublishRoute(new Request("http://t", { method: "POST" }), params(PID));
    expect(res.status).toBe(401);
  });

  it("returns publication status and revision on success", async () => {
    unpublishMock.mockResolvedValue({
      ok: true,
      publicationStatus: "UNPUBLISHED",
      revision: BigInt(7),
    });
    const res = await unpublishRoute(new Request("http://t", { method: "POST" }), params(PID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { publicationStatus: "UNPUBLISHED", revision: "7" },
    });
  });

  it("404 when not found", async () => {
    unpublishMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await unpublishRoute(new Request("http://t", { method: "POST" }), params(PID));
    expect(res.status).toBe(404);
  });
});
