// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Guard-only route tests: these paths return before any database access, so
// Clerk and Prisma are mocked and no real database is required.
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { GET as listPortfoliosRoute } from "@/app/api/portfolios/route";
import { GET as getPortfolioRoute } from "@/app/api/portfolios/[portfolioId]/route";

const authMock = vi.mocked(auth);

function params(portfolioId: string) {
  return { params: Promise.resolve({ portfolioId }) };
}

describe("GET /api/portfolios (guards)", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: null } as never);
  });

  it("returns 401 and no-store when unauthenticated", async () => {
    const response = await listPortfoliosRoute();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHENTICATED", message: "Authentication required" },
    });
  });
});

describe("GET /api/portfolios/[portfolioId] (guards)", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const response = await getPortfolioRoute(new Request("http://t"), params(randomUUID()));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 400 for an invalid portfolio id", async () => {
    authMock.mockResolvedValue({ userId: "user_123" } as never);
    const response = await getPortfolioRoute(new Request("http://t"), params("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: { code: "INVALID_PORTFOLIO_ID", message: "Invalid portfolio id" },
    });
  });
});
