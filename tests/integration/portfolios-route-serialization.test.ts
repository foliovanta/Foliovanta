// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

// Regression for the reported `GET /api/portfolios` INTERNAL_ERROR: the owner's
// BigInt `publicSlug` must be serialized to a string before it reaches
// NextResponse.json (which cannot serialize BigInt and would 500). This drives
// the REAL route handler against REAL Prisma rows — the only path that exercises
// the JSON serialization boundary (the service-level tests do not).
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

describe.skipIf(!optedIn)("GET /api/portfolios serialization (integration)", () => {
  let GET: typeof import("@/app/api/portfolios/route").GET;
  let prisma: typeof import("@/lib/db/prisma").prisma;
  let authMock: ReturnType<typeof vi.fn>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    ({ prisma } = await import("@/lib/db/prisma"));
    ({ GET } = await import("@/app/api/portfolios/route"));
    const clerk = await import("@clerk/nextjs/server");
    authMock = vi.mocked(clerk.auth) as unknown as ReturnType<typeof vi.fn>;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("returns 200 and JSON-serializes publicSlug as a string (no BigInt 500)", async () => {
    const user = await prisma.user.create({
      data: { clerkUserId: `test_${randomUUID()}`, status: "ACTIVE" },
      select: { id: true, clerkUserId: true, publicSlug: true },
    });
    createdUserIds.push(user.id);
    await prisma.portfolio.create({
      data: { ownerId: user.id, slug: `test-${randomUUID().slice(0, 12)}` },
    });

    authMock.mockResolvedValue({ userId: user.clerkUserId } as never);

    const res = await GET();
    expect(res.status).toBe(200); // 500 here would be the INTERNAL_ERROR regression
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].publicSlug).toBe(user.publicSlug.toString());
    expect(typeof body.data[0].publicSlug).toBe("string");
    // Internal fields never leak through the summary.
    expect(body.data[0]).not.toHaveProperty("ownerId");
    expect(body.data[0]).not.toHaveProperty("owner");
  });
});
