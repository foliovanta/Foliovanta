import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as UsersModule from "@/lib/admin/users-directory";
import type * as PortfoliosModule from "@/lib/admin/portfolios-directory";
import type * as PublishModule from "@/lib/publishing/publish-service";
import type * as PublicReadModule from "@/lib/publishing/public-read";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
const authMock = vi.mocked(auth);

describe.skipIf(!optedIn)("admin directory services (integration)", () => {
  let users: typeof UsersModule;
  let portfolios: typeof PortfoliosModule;
  let publish: typeof PublishModule;
  let publicRead: typeof PublicReadModule;
  let prisma: typeof Prisma;
  const createdUserIds: string[] = [];

  async function createUser(opts: {
    role?: "USER" | "ADMIN" | "SUPER_ADMIN";
    status?: "ACTIVE" | "SUSPENDED" | "DELETION_PENDING";
    name?: string | null;
    email?: string | null;
  } = {}) {
    const user = await prisma.user.create({
      data: {
        clerkUserId: `test_${randomUUID()}`,
        role: opts.role ?? "USER",
        status: opts.status ?? "ACTIVE",
        name: opts.name === undefined ? "Ada" : opts.name,
        email: opts.email === undefined ? `${randomUUID().slice(0, 8)}@test.dev` : opts.email,
      },
      select: { id: true, clerkUserId: true, publicSlug: true },
    });
    createdUserIds.push(user.id);
    return user;
  }
  async function createPortfolio(ownerId: string, title = "Folio") {
    const portfolio = await prisma.portfolio.create({
      data: { ownerId, slug: `admin-${randomUUID().slice(0, 12)}`, title },
      select: { id: true },
    });
    await prisma.portfolioProfile.create({
      data: { portfolioId: portfolio.id, displayName: "Ada Lovelace" },
    });
    return portfolio;
  }
  const asAdmin = (clerkUserId: string) => authMock.mockResolvedValue({ userId: clerkUserId } as never);

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    users = await import("@/lib/admin/users-directory");
    portfolios = await import("@/lib/admin/portfolios-directory");
    publish = await import("@/lib/publishing/publish-service");
    publicRead = await import("@/lib/publishing/public-read");
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  beforeEach(() => authMock.mockReset());

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length > 0) {
      await prisma.portfolio.updateMany({
        where: { ownerId: { in: createdUserIds } },
        data: { activeVersionId: null },
      });
      await prisma.portfolio.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("denies a USER and allows a SUPER_ADMIN (both directories)", async () => {
    const user = await createUser({ role: "USER" });
    asAdmin(user.clerkUserId);
    expect((await users.listAdminUsers({ limit: 10 })).ok).toBe(false);
    expect((await portfolios.listAdminPortfolios({ limit: 10, sort: "createdAt" })).ok).toBe(false);

    const admin = await createUser({ role: "SUPER_ADMIN" });
    asAdmin(admin.clerkUserId);
    expect((await users.listAdminUsers({ limit: 10 })).ok).toBe(true);
    expect((await portfolios.listAdminPortfolios({ limit: 10, sort: "createdAt" })).ok).toBe(true);
  });

  it("never exposes an email address, only whether one is on file", async () => {
    const admin = await createUser({ role: "SUPER_ADMIN" });
    const withEmail = await createUser({ email: "secret@private.dev", name: "HasMail" });
    const withoutEmail = await createUser({ email: null, name: "NoMail" });
    asAdmin(admin.clerkUserId);

    const r1 = await users.getAdminUserDetail(withEmail.id);
    const r2 = await users.getAdminUserDetail(withoutEmail.id);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(JSON.stringify(r1.user)).not.toContain("secret@private.dev");
      expect(r1.user.hasEmail).toBe(true);
      expect(r2.user.hasEmail).toBe(false);
      // No `email` property is present on the DTO at all.
      expect("email" in r1.user).toBe(false);
    }
  });

  it("searches users by exact id, public slug, and bounded name contains", async () => {
    const admin = await createUser({ role: "SUPER_ADMIN" });
    const token = `mark${randomUUID().slice(0, 6)}`;
    const target = await createUser({ name: `${token} Person` });
    asAdmin(admin.clerkUserId);

    const byId = await users.listAdminUsers({ limit: 10, q: target.id });
    expect(byId.ok && byId.page.items.some((u) => u.id === target.id)).toBe(true);

    const bySlug = await users.listAdminUsers({ limit: 10, q: target.publicSlug.toString() });
    expect(bySlug.ok && bySlug.page.items.some((u) => u.id === target.id)).toBe(true);

    const byName = await users.listAdminUsers({ limit: 10, q: token });
    expect(byName.ok && byName.page.items.some((u) => u.id === target.id)).toBe(true);
  });

  it("filters users by role and status", async () => {
    const admin = await createUser({ role: "SUPER_ADMIN" });
    const suspended = await createUser({ status: "SUSPENDED" });
    asAdmin(admin.clerkUserId);

    const result = await users.listAdminUsers({ limit: 100, status: "SUSPENDED" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.page.items.every((u) => u.status === "SUSPENDED")).toBe(true);
      expect(result.page.items.some((u) => u.id === suspended.id)).toBe(true);
    }
  });

  it("paginates deterministically with no duplicates or omissions", async () => {
    const admin = await createUser({ role: "SUPER_ADMIN" });
    const token = `pg${randomUUID().slice(0, 8)}`;
    const created: string[] = [];
    for (let i = 0; i < 5; i++) created.push((await createUser({ name: `${token}-${i}` })).id);
    asAdmin(admin.clerkUserId);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await users.listAdminUsers({ limit: 2, q: token, ...(cursor ? { cursor: decode(cursor) } : {}) });
      if (!page.ok) throw new Error("list failed");
      seen.push(...page.page.items.map((u) => u.id));
      if (!page.page.nextCursor) break;
      cursor = page.page.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect(seen.filter((id) => created.includes(id)).sort()).toEqual([...created].sort()); // no omissions
  });

  it("detail: not found for a missing or invalid id", async () => {
    const admin = await createUser({ role: "SUPER_ADMIN" });
    asAdmin(admin.clerkUserId);
    expect(await users.getAdminUserDetail(randomUUID())).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await users.getAdminUserDetail("not-a-uuid")).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("portfolio eligibility agrees with the public read, and only eligible rows expose a canonical URL", async () => {
    const admin = await createUser({ role: "SUPER_ADMIN" });
    const owner = await createUser();
    const draft = await createPortfolio(owner.id, "Draft one");
    const published = await createPortfolio(owner.id, "Live one");
    const pub = await publish.publishPortfolio(owner.clerkUserId, published.id, BigInt(0));
    if (!pub.ok) throw new Error("publish failed");
    asAdmin(admin.clerkUserId);

    const draftDetail = await portfolios.getAdminPortfolioDetail(draft.id);
    const liveDetail = await portfolios.getAdminPortfolioDetail(published.id);
    expect(draftDetail.ok && liveDetail.ok).toBe(true);
    if (draftDetail.ok && liveDetail.ok) {
      expect(draftDetail.portfolio.publiclyEligible).toBe(false);
      expect(draftDetail.portfolio.canonicalUrl).toBeNull();
      expect(draftDetail.portfolio.visibilityReasons.length).toBeGreaterThan(0);

      expect(liveDetail.portfolio.publiclyEligible).toBe(true);
      expect(liveDetail.portfolio.canonicalUrl).toContain(`/${owner.publicSlug.toString()}/`);
      // Parity: the public read actually serves the one the admin marks eligible.
      expect((await publicRead.getPublicPortfolioByUserSlug(owner.publicSlug.toString())).ok).toBe(true);
    }
  });

  it("detail never includes snapshot JSON or draft section content", async () => {
    const admin = await createUser({ role: "SUPER_ADMIN" });
    const owner = await createUser();
    const portfolio = await createPortfolio(owner.id, "Secret Title");
    await publish.publishPortfolio(owner.clerkUserId, portfolio.id, BigInt(0));
    asAdmin(admin.clerkUserId);

    const detail = await portfolios.getAdminPortfolioDetail(portfolio.id);
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      const json = JSON.stringify(detail.portfolio);
      expect(json).not.toContain("snapshot");
      expect(json).not.toContain("schemaVersion");
      // Owner display name (profile) is not pulled into the directory projection.
      expect(json).not.toContain("Ada Lovelace");
    }
  });

  it("lets an admin inspect any owner's portfolio (cross-owner), read-only", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const owner = await createUser();
    const portfolio = await createPortfolio(owner.id, "Someone else's");
    asAdmin(admin.clerkUserId);
    const detail = await portfolios.getAdminPortfolioDetail(portfolio.id);
    expect(detail.ok && detail.portfolio.ownerId).toBe(owner.id);
  });

  it("revokes directory access mid-session when the role changes", async () => {
    const admin = await createUser({ role: "SUPER_ADMIN" });
    asAdmin(admin.clerkUserId);
    expect((await users.listAdminUsers({ limit: 1 })).ok).toBe(true);
    await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    expect((await users.listAdminUsers({ limit: 1 })).ok).toBe(false);
  });
});

// Local decode mirroring the client/route cursor handling for the pagination test.
function decode(raw: string): { v: string; id: string } {
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { v: string; id: string };
}
