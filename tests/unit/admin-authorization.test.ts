// @vitest-environment node
import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { resolveAdminActor, requirePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db/prisma";

const authMock = vi.mocked(auth);
const findUnique = vi.mocked(prisma.user.findUnique);

function signedInAs(clerkUserId: string | null) {
  authMock.mockResolvedValue({ userId: clerkUserId } as never);
}
function dbUser(user: Record<string, unknown> | null) {
  findUnique.mockResolvedValue(user as never);
}

const superAdmin = {
  id: "u-1",
  clerkUserId: "clerk_1",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
  email: "a@b.c",
  name: "Ada",
};

describe("resolveAdminActor", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUnique.mockReset();
  });

  it("rejects anonymous callers with 401 and never touches the DB", async () => {
    signedInAs(null);
    const result = await resolveAdminActor();
    expect(result).toMatchObject({ ok: false, reason: "UNAUTHENTICATED", status: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects an authenticated user with no internal row (403, not synced)", async () => {
    signedInAs("clerk_x");
    dbUser(null);
    const result = await resolveAdminActor();
    expect(result).toMatchObject({ ok: false, reason: "NOT_SYNCED", status: 403 });
  });

  it("rejects a suspended admin account (403, inactive)", async () => {
    signedInAs("clerk_1");
    dbUser({ ...superAdmin, status: "SUSPENDED" });
    const result = await resolveAdminActor();
    expect(result).toMatchObject({ ok: false, reason: "ACCOUNT_INACTIVE", status: 403 });
  });

  it("rejects a deletion-pending admin account", async () => {
    signedInAs("clerk_1");
    dbUser({ ...superAdmin, status: "DELETION_PENDING" });
    const result = await resolveAdminActor();
    expect(result).toMatchObject({ ok: false, reason: "ACCOUNT_INACTIVE" });
  });

  it("rejects a plain USER with 403 (deny by default)", async () => {
    signedInAs("clerk_2");
    dbUser({ ...superAdmin, id: "u-2", role: "USER" });
    const result = await resolveAdminActor();
    expect(result).toMatchObject({ ok: false, reason: "FORBIDDEN", status: 403, actorUserId: "u-2" });
  });

  it("resolves an ACTIVE admin with the role read from the database", async () => {
    signedInAs("clerk_1");
    dbUser({ ...superAdmin, role: "ADMIN" });
    const result = await resolveAdminActor();
    expect(result).toMatchObject({ ok: true, actor: { userId: "u-1", role: "ADMIN" } });
  });

  it("ignores any client-supplied role — only the DB role matters", async () => {
    // Even though a caller might forge a role elsewhere, resolution reads the DB.
    signedInAs("clerk_2");
    dbUser({ ...superAdmin, id: "u-2", role: "USER" });
    const result = await resolveAdminActor();
    expect(result.ok).toBe(false);
  });
});

describe("requirePermission", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUnique.mockReset();
  });

  it("allows SUPER_ADMIN the audit permission", async () => {
    signedInAs("clerk_1");
    dbUser(superAdmin);
    const result = await requirePermission("admin.audit.read");
    expect(result.ok).toBe(true);
  });

  it("denies ADMIN a SUPER_ADMIN-only permission (vertical escalation blocked)", async () => {
    signedInAs("clerk_1");
    dbUser({ ...superAdmin, role: "ADMIN" });
    const result = await requirePermission("admin.audit.read");
    expect(result).toMatchObject({ ok: false, reason: "FORBIDDEN", status: 403, actorUserId: "u-1" });
  });

  it("allows ADMIN a permission it carries", async () => {
    signedInAs("clerk_1");
    dbUser({ ...superAdmin, role: "ADMIN" });
    const result = await requirePermission("admin.overview.read");
    expect(result.ok).toBe(true);
  });

  it("re-reads the role every call, so a mid-session revocation revokes access", async () => {
    signedInAs("clerk_1");
    dbUser(superAdmin);
    expect((await requirePermission("admin.overview.read")).ok).toBe(true);
    // Role revoked in the DB (no sign-out): the next call denies.
    dbUser({ ...superAdmin, role: "USER" });
    expect((await requirePermission("admin.overview.read")).ok).toBe(false);
  });
});
