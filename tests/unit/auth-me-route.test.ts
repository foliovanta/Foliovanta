// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/auth/me must stay an authenticated GET; it returns before any DB work
// when there is no session, so Prisma is stubbed.
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { GET } from "@/app/api/auth/me/route";
import { auth } from "@clerk/nextjs/server";

const authMock = vi.mocked(auth);

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("requires authentication", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const response = await GET();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
