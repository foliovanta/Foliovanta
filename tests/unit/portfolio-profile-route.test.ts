// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Guard-only route tests: these paths return before any database access, so
// Clerk and Prisma are mocked and no real database is required.
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  GET as getProfileRoute,
  PATCH as patchProfileRoute,
} from "@/app/api/portfolios/[portfolioId]/profile/route";

const authMock = vi.mocked(auth);

function params(portfolioId: string) {
  return { params: Promise.resolve({ portfolioId }) };
}

function jsonRequest(body: unknown) {
  return new Request("http://t", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("portfolio profile route guards", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: null } as never);
  });

  it("GET returns 401 when unauthenticated", async () => {
    const response = await getProfileRoute(new Request("http://t"), params(randomUUID()));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("PATCH returns 401 when unauthenticated", async () => {
    const response = await patchProfileRoute(
      jsonRequest({ expectedRevision: "0" }),
      params(randomUUID()),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("GET returns 400 for an invalid portfolio id", async () => {
    authMock.mockResolvedValue({ userId: "user_123" } as never);
    const response = await getProfileRoute(new Request("http://t"), params("not-a-uuid"));
    expect(response.status).toBe(400);
  });

  it("PATCH returns 400 for a missing expectedRevision", async () => {
    authMock.mockResolvedValue({ userId: "user_123" } as never);
    const response = await patchProfileRoute(
      jsonRequest({ displayName: "Ada" }),
      params(randomUUID()),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("PATCH returns 400 for unknown properties", async () => {
    authMock.mockResolvedValue({ userId: "user_123" } as never);
    const response = await patchProfileRoute(
      jsonRequest({ expectedRevision: "0", nope: true }),
      params(randomUUID()),
    );
    expect(response.status).toBe(400);
  });
});
