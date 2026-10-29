// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/publishing/publish-status", () => ({ getPublishStatus: vi.fn() }));
vi.mock("@/lib/publishing/version-history", () => ({ listPortfolioVersions: vi.fn() }));

import { GET as statusRoute } from "@/app/api/portfolios/[portfolioId]/publish-status/route";
import { GET as versionsRoute } from "@/app/api/portfolios/[portfolioId]/versions/route";
import { getPublishStatus } from "@/lib/publishing/publish-status";
import { listPortfolioVersions } from "@/lib/publishing/version-history";

const authMock = vi.mocked(auth);
const statusMock = vi.mocked(getPublishStatus);
const versionsMock = vi.mocked(listPortfolioVersions);

const PID = randomUUID();
const params = (portfolioId: string) => ({ params: Promise.resolve({ portfolioId }) });
const req = (url = "http://t") => new Request(url);

describe("GET /api/portfolios/[portfolioId]/publish-status", () => {
  beforeEach(() => {
    authMock.mockReset();
    statusMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const res = await statusRoute(req(), params(PID));
    expect(res.status).toBe(401);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("400 for an invalid portfolio id", async () => {
    const res = await statusRoute(req(), params("bad"));
    expect(res.status).toBe(400);
  });

  it("serializes bigint revision and dates, dropping private version fields", async () => {
    statusMock.mockResolvedValue({
      ok: true,
      status: {
        slug: "ada",
        publicSlug: "10482",
        username: "ada",
        templateKey: "professional",
        publicationStatus: "PUBLISHED",
        moderationStatus: "CLEAR",
        revision: BigInt(9),
        publishedAt: new Date("2026-01-02T03:04:05.000Z"),
        hasUnpublishedChanges: true,
        readiness: { ok: true },
        activeVersion: {
          versionNumber: 2,
          publishedAt: new Date("2026-01-02T03:04:05.000Z"),
          templateId: "minimal",
          templateVersion: "1",
        },
      },
    });
    const res = await statusRoute(req(), params(PID));
    expect(res.status).toBe(200);
    expect(statusMock).toHaveBeenCalledWith("user_1", PID);
    await expect(res.json()).resolves.toEqual({
      data: {
        slug: "ada",
        publicSlug: "10482",
        username: "ada",
        templateKey: "professional",
        publicationStatus: "PUBLISHED",
        moderationStatus: "CLEAR",
        revision: "9",
        publishedAt: "2026-01-02T03:04:05.000Z",
        hasUnpublishedChanges: true,
        readiness: { ok: true },
        activeVersion: {
          versionNumber: 2,
          publishedAt: "2026-01-02T03:04:05.000Z",
          templateId: "minimal",
          templateVersion: "1",
        },
      },
    });
  });

  it("404 when not found / unowned", async () => {
    statusMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await statusRoute(req(), params(PID));
    expect(res.status).toBe(404);
  });

  it("403 when the account is suspended", async () => {
    statusMock.mockResolvedValue({ ok: false, error: "ACCOUNT_SUSPENDED" });
    const res = await statusRoute(req(), params(PID));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/portfolios/[portfolioId]/versions", () => {
  beforeEach(() => {
    authMock.mockReset();
    versionsMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const res = await versionsRoute(req(), params(PID));
    expect(res.status).toBe(401);
    expect(versionsMock).not.toHaveBeenCalled();
  });

  it("maps versions and passes a parsed cursor through", async () => {
    versionsMock.mockResolvedValue({
      ok: true,
      versions: [
        {
          versionNumber: 2,
          publishedAt: new Date("2026-01-02T00:00:00.000Z"),
          templateId: "minimal",
          templateVersion: "1",
          isActive: true,
        },
      ],
      nextCursor: 1,
    });
    const res = await versionsRoute(req("http://t?cursor=5&limit=10"), params(PID));
    expect(res.status).toBe(200);
    expect(versionsMock).toHaveBeenCalledWith("user_1", PID, { cursor: 5, limit: 10 });
    await expect(res.json()).resolves.toEqual({
      data: {
        versions: [
          {
            versionNumber: 2,
            publishedAt: "2026-01-02T00:00:00.000Z",
            templateId: "minimal",
            templateVersion: "1",
            isActive: true,
          },
        ],
        nextCursor: 1,
      },
    });
  });

  it("ignores a non-numeric cursor rather than failing", async () => {
    versionsMock.mockResolvedValue({ ok: true, versions: [], nextCursor: null });
    const res = await versionsRoute(req("http://t?cursor=abc"), params(PID));
    expect(res.status).toBe(200);
    expect(versionsMock).toHaveBeenCalledWith("user_1", PID, {});
  });

  it("404 when not found / unowned", async () => {
    versionsMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await versionsRoute(req(), params(PID));
    expect(res.status).toBe(404);
  });
});
