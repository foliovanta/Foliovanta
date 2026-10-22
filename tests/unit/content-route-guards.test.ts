// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Guard-only route tests: these paths return before any database access, so
// Clerk and Prisma are mocked and no real database is required. The three
// repeatable content types share the same generic handlers, so exercising
// experience's routes covers education and skills too.
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { POST as createRoute } from "@/app/api/portfolios/[portfolioId]/experience/route";
import { PATCH as updateRoute } from "@/app/api/portfolios/[portfolioId]/experience/[itemId]/route";
import { PATCH as reorderRoute } from "@/app/api/portfolios/[portfolioId]/experience/reorder/route";
import { PATCH as sectionRoute } from "@/app/api/portfolios/[portfolioId]/sections/[sectionKey]/route";

const authMock = vi.mocked(auth);

const portfolioParams = (portfolioId: string) => ({ params: Promise.resolve({ portfolioId }) });
const itemParams = (portfolioId: string, itemId: string) => ({
  params: Promise.resolve({ portfolioId, itemId }),
});
const sectionParams = (portfolioId: string, sectionKey: string) => ({
  params: Promise.resolve({ portfolioId, sectionKey }),
});

function patch(body: unknown) {
  return new Request("http://t", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("repeatable content route guards", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: null } as never);
  });

  it("create returns 401 when unauthenticated", async () => {
    const response = await createRoute(
      patch({ expectedRevision: "0", organization: "o", roleTitle: "r" }),
      portfolioParams(randomUUID()),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("create returns 400 for an invalid portfolio id", async () => {
    authMock.mockResolvedValue({ userId: "u" } as never);
    const response = await createRoute(
      patch({ expectedRevision: "0", organization: "o", roleTitle: "r" }),
      portfolioParams("bad"),
    );
    expect(response.status).toBe(400);
  });

  it("create returns 400 when required fields are missing", async () => {
    authMock.mockResolvedValue({ userId: "u" } as never);
    const response = await createRoute(
      patch({ expectedRevision: "0" }),
      portfolioParams(randomUUID()),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("update returns 400 when no fields are provided", async () => {
    authMock.mockResolvedValue({ userId: "u" } as never);
    const response = await updateRoute(
      patch({ expectedRevision: "0" }),
      itemParams(randomUUID(), randomUUID()),
    );
    expect(response.status).toBe(400);
  });

  it("reorder returns 400 for an empty id list", async () => {
    authMock.mockResolvedValue({ userId: "u" } as never);
    const response = await reorderRoute(
      patch({ expectedRevision: "0", ids: [] }),
      portfolioParams(randomUUID()),
    );
    expect(response.status).toBe(400);
  });
});

describe("section route guards", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const response = await sectionRoute(
      patch({ expectedRevision: "0", isVisible: true }),
      sectionParams(randomUUID(), "PROFILE"),
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for an unknown section key", async () => {
    authMock.mockResolvedValue({ userId: "u" } as never);
    const response = await sectionRoute(
      patch({ expectedRevision: "0", isVisible: true }),
      sectionParams(randomUUID(), "NOT_A_SECTION"),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_SECTION_KEY" },
    });
  });

  it("returns 400 when no fields are provided", async () => {
    authMock.mockResolvedValue({ userId: "u" } as never);
    const response = await sectionRoute(
      patch({ expectedRevision: "0" }),
      sectionParams(randomUUID(), "PROFILE"),
    );
    expect(response.status).toBe(400);
  });
});
