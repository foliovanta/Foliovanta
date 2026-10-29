import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";
import { type AuthzFailure, requirePermission } from "@/lib/auth/authorization";
import { type Cursor, type CursorPage, buildCursorPage, keysetWhere } from "@/lib/admin/pagination";
import { prisma } from "@/lib/db/prisma";

// Non-PII projection. Email is NEVER included (address or search) — see the
// data-access policy in the M6.2 decision doc; only "is an email on file" is
// surfaced. Display name falls back to the public slug, never the email.
export type AdminUserListItem = {
  id: string;
  publicSlug: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  hasEmail: boolean;
  portfolioCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserPortfolioRef = {
  id: string;
  title: string | null;
  publicationStatus: string;
  moderationStatus: string;
  deleted: boolean;
  updatedAt: string;
};

export type AdminUserDetail = AdminUserListItem & {
  deletionPending: boolean;
  clerkDeletedAt: string | null;
  portfolios: AdminUserPortfolioRef[];
};

export type AdminUserFilters = {
  role?: UserRole;
  status?: UserStatus;
  // Free-text: an exact user id (UUID), an exact publicSlug (digits), or a
  // bounded display-name contains. Email is intentionally not searchable here.
  q?: string;
};

export type ListUsersParams = AdminUserFilters & { limit: number; cursor?: Cursor };

export type ListUsersResult =
  | { ok: true; page: CursorPage<AdminUserListItem> }
  | { ok: false; failure: AuthzFailure };

export type UserDetailResult =
  | { ok: true; user: AdminUserDetail }
  | { ok: false; failure: AuthzFailure }
  | { ok: false; error: "NOT_FOUND" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS_RE = /^[0-9]{1,19}$/;

function displayName(name: string | null, publicSlug: bigint): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `User ${publicSlug.toString()}`;
}

// Translate free-text search into a safe, bounded Prisma filter.
function searchWhere(q: string | undefined): Prisma.UserWhereInput | null {
  const term = q?.trim();
  if (!term) return null;
  if (UUID_RE.test(term)) return { id: term };
  if (DIGITS_RE.test(term)) {
    try {
      return { publicSlug: BigInt(term) };
    } catch {
      return { id: "__no_match__" };
    }
  }
  // Bounded, case-insensitive contains on display name only.
  return { name: { contains: term.slice(0, 100), mode: "insensitive" } };
}

const listSelect = {
  id: true,
  publicSlug: true,
  username: true,
  name: true,
  role: true,
  status: true,
  email: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { portfolios: { where: { deletedAt: null } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof listSelect }>;

function toListItem(row: UserRow): AdminUserListItem {
  return {
    id: row.id,
    publicSlug: row.publicSlug.toString(),
    username: row.username,
    displayName: displayName(row.name, row.publicSlug),
    role: row.role,
    status: row.status,
    hasEmail: Boolean(row.email),
    portfolioCount: row._count.portfolios,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Owner-scoped admin user directory. Deterministic keyset order
 * (createdAt desc, id desc). Enforces `admin.users.read` itself — it does not
 * trust the route, layout, or middleware.
 */
export async function listAdminUsers(params: ListUsersParams): Promise<ListUsersResult> {
  const authz = await requirePermission("admin.users.read");
  if (!authz.ok) return { ok: false, failure: authz };

  const search = searchWhere(params.q);
  const where: Prisma.UserWhereInput = {
    ...(params.role ? { role: params.role } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(search ?? {}),
    ...(params.cursor ? keysetWhere("createdAt", params.cursor, "desc") : {}),
  };

  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    select: listSelect,
  });

  const page = buildCursorPage(rows.map(toListItem), params.limit, (item) => ({
    v: item.createdAt,
    id: item.id,
  }));
  return { ok: true, page };
}

export async function getAdminUserDetail(userId: string): Promise<UserDetailResult> {
  const authz = await requirePermission("admin.users.read");
  if (!authz.ok) return { ok: false, failure: authz };

  if (!UUID_RE.test(userId)) return { ok: false, error: "NOT_FOUND" };

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...listSelect,
      clerkDeletedAt: true,
      portfolios: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          title: true,
          publicationStatus: true,
          moderationStatus: true,
          deletedAt: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!row) return { ok: false, error: "NOT_FOUND" };

  const user: AdminUserDetail = {
    ...toListItem(row),
    deletionPending: row.status === "DELETION_PENDING",
    clerkDeletedAt: row.clerkDeletedAt ? row.clerkDeletedAt.toISOString() : null,
    portfolios: row.portfolios.map((p) => ({
      id: p.id,
      title: p.title,
      publicationStatus: p.publicationStatus,
      moderationStatus: p.moderationStatus,
      deleted: p.deletedAt !== null,
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
  return { ok: true, user };
}
