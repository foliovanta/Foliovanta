// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Guard-only route tests: these paths return before any database access, so
// Clerk and Prisma are mocked and no real database is required.
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  GET as listRoute,
  POST as createRoute,
} from "@/app/api/portfolios/[portfolioId]/projects/route";
import {
  DELETE as deleteRoute,
  PATCH as updateRoute,
} from "@/app/api/portfolios/[portfolioId]/projects/[projectId]/route";
import { PATCH as reorderRoute } from "@/app/api/portfolios/[portfolioId]/projects/reorder/route";

const authMock = vi.mocked(auth);

const portfolioParams = (portfolioId: string) => ({ params: Promise.resolve({ portfolioId }) });
const projectParams = (portfolioId: string, projectId: string) => ({
  params: Promise.resolve({ portfolioId, projectId }),
});

function patch(body: unknown) {
  return new Request("http://t", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("project route guards", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: null } as never);
  });

  it("GET list returns 401 when unauthenticated", async () => {
    const response = await listRoute(new Request("http://t"), portfolioParams(randomUUID()));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("POST returns 401 when unauthenticated", async () => {
    const response = await createRoute(
      patch({ expectedRevision: "0", title: "x" }),
      portfolioParams(randomUUID()),
    );
    expect(response.status).toBe(401);
  });

  it("POST returns 400 for an invalid portfolio id", async () => {
    authMock.mockResolvedValue({ userId: "user_1" } as never);
    const response = await createRoute(
      patch({ expectedRevision: "0", title: "x" }),
      portfolioParams("bad"),
    );
    expect(response.status).toBe(400);
  });

  it("POST returns 400 when title is missing", async () => {
    authMock.mockResolvedValue({ userId: "user_1" } as never);
    const response = await createRoute(
      patch({ expectedRevision: "0" }),
      portfolioParams(randomUUID()),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("PATCH project returns 400 when no fields are provided", async () => {
    authMock.mockResolvedValue({ userId: "user_1" } as never);
    const response = await updateRoute(
      patch({ expectedRevision: "0" }),
      projectParams(randomUUID(), randomUUID()),
    );
    expect(response.status).toBe(400);
  });

  it("DELETE returns 400 when expectedRevision is missing", async () => {
    authMock.mockResolvedValue({ userId: "user_1" } as never);
    const response = await deleteRoute(patch({}), projectParams(randomUUID(), randomUUID()));
    expect(response.status).toBe(400);
  });

  it("reorder returns 400 for an empty projectIds list", async () => {
    authMock.mockResolvedValue({ userId: "user_1" } as never);
    const response = await reorderRoute(
      patch({ expectedRevision: "0", projectIds: [] }),
      portfolioParams(randomUUID()),
    );
    expect(response.status).toBe(400);
  });

  it("reorder returns 401 when unauthenticated", async () => {
    const response = await reorderRoute(
      patch({ expectedRevision: "0", projectIds: [randomUUID()] }),
      portfolioParams(randomUUID()),
    );
    expect(response.status).toBe(401);
  });
});
