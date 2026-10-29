import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { PortfolioModerationStatus, PortfolioPublicationStatus } from "@/generated/prisma/enums";
import { type AuthzFailure, requirePermission } from "@/lib/auth/authorization";
import { type Cursor, type CursorPage, buildCursorPage, keysetWhere } from "@/lib/admin/pagination";
import { prisma } from "@/lib/db/prisma";
import { evaluatePublicVisibility } from "@/lib/publishing/visibility";
import { publicPortfolioUrl } from "@/lib/urls/public-url";

// Metadata only — NEVER draft sections or published snapshot JSON.
export type AdminPortfolioListItem = {
  id: string;
  ownerId: string;
  ownerPublicSlug: string;
  ownerUsername: string;
  ownerDisplayName: string;
  title: string | null;
  publicationStatus: PortfolioPublicationStatus;
  moderationStatus: PortfolioModerationStatus;
  activeVersionNumber: number | null;
  deleted: boolean;
  publiclyEligible: boolean;
  // Present ONLY when the portfolio is actually publicly visible.
  canonicalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type AdminPortfolioDetail = AdminPortfolioListItem & {
  lastDraftSavedAt: string | null;
  deletedAt: string | null;
  // Human-readable reasons when not publicly eligible (empty when eligible).
  visibilityReasons: string[];
};

export type PortfolioSort = "createdAt" | "updatedAt";

export type AdminPortfolioFilters = {
  publicationStatus?: PortfolioPublicationStatus;
  moderationStatus?: PortfolioModerationStatus;
  // Exact portfolio id (UUID), exact owner id (UUID), or bounded title contains.
  q?: string;
};

export type ListPortfoliosParams = AdminPortfolioFilters & {
  limit: number;
  cursor?: Cursor;
  sort: PortfolioSort;
};

export type ListPortfoliosResult =
  | { ok: true; page: CursorPage<AdminPortfolioListItem> }
  | { ok: false; failure: AuthzFailure };

export type PortfolioDetailResult =
  | { ok: true; portfolio: AdminPortfolioDetail }
  | { ok: false; failure: AuthzFailure }
  | { ok: false; error: "NOT_FOUND" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ownerDisplayName(name: string | null, publicSlug: bigint): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `User ${publicSlug.toString()}`;
}

function searchWhere(q: string | undefined): Prisma.PortfolioWhereInput | null {
  const term = q?.trim();
  if (!term) return null;
  // A UUID could be a portfolio id OR an owner id — match either.
  if (UUID_RE.test(term)) return { OR: [{ id: term }, { ownerId: term }] };
  return { title: { contains: term.slice(0, 100), mode: "insensitive" } };
}

const listSelect = {
  id: true,
  ownerId: true,
  title: true,
  publicationStatus: true,
  moderationStatus: true,
  activeVersionId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  owner: { select: { publicSlug: true, username: true, name: true, status: true } },
  activeVersion: { select: { versionNumber: true } },
} satisfies Prisma.PortfolioSelect;

type PortfolioRow = Prisma.PortfolioGetPayload<{ select: typeof listSelect }>;

function toListItem(row: PortfolioRow): AdminPortfolioListItem {
  const visibility = evaluatePublicVisibility({
    deletedAt: row.deletedAt,
    publicationStatus: row.publicationStatus,
    moderationStatus: row.moderationStatus,
    activeVersionId: row.activeVersionId,
    ownerStatus: row.owner.status,
  });
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerPublicSlug: row.owner.publicSlug.toString(),
    ownerUsername: row.owner.username,
    ownerDisplayName: ownerDisplayName(row.owner.name, row.owner.publicSlug),
    title: row.title,
    publicationStatus: row.publicationStatus,
    moderationStatus: row.moderationStatus,
    activeVersionNumber: row.activeVersion?.versionNumber ?? null,
    deleted: row.deletedAt !== null,
    publiclyEligible: visibility.eligible,
    // Only expose a canonical link when the page is genuinely publicly visible.
    canonicalUrl: visibility.eligible
      ? publicPortfolioUrl(row.owner.publicSlug.toString(), row.owner.username)
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}

/**
 * Admin portfolio directory across all owners. Enforces `admin.portfolios.read`
 * itself. Deterministic keyset order on the chosen sort field (desc) with an id
 * tie-breaker. Includes soft-deleted portfolios (metadata only) for oversight.
 */
export async function listAdminPortfolios(
  params: ListPortfoliosParams,
): Promise<ListPortfoliosResult> {
  const authz = await requirePermission("admin.portfolios.read");
  if (!authz.ok) return { ok: false, failure: authz };

  const search = searchWhere(params.q);
  const where: Prisma.PortfolioWhereInput = {
    ...(params.publicationStatus ? { publicationStatus: params.publicationStatus } : {}),
    ...(params.moderationStatus ? { moderationStatus: params.moderationStatus } : {}),
    ...(search ?? {}),
    ...(params.cursor ? keysetWhere(params.sort, params.cursor, "desc") : {}),
  };

  const rows = await prisma.portfolio.findMany({
    where,
    orderBy: [{ [params.sort]: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    select: listSelect,
  });

  const page = buildCursorPage(rows.map(toListItem), params.limit, (item) => ({
    v: params.sort === "createdAt" ? item.createdAt : item.updatedAt,
    id: item.id,
  }));
  return { ok: true, page };
}

export async function getAdminPortfolioDetail(
  portfolioId: string,
): Promise<PortfolioDetailResult> {
  const authz = await requirePermission("admin.portfolios.read");
  if (!authz.ok) return { ok: false, failure: authz };

  if (!UUID_RE.test(portfolioId)) return { ok: false, error: "NOT_FOUND" };

  const row = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { ...listSelect, lastDraftSavedAt: true },
  });
  if (!row) return { ok: false, error: "NOT_FOUND" };

  const visibility = evaluatePublicVisibility({
    deletedAt: row.deletedAt,
    publicationStatus: row.publicationStatus,
    moderationStatus: row.moderationStatus,
    activeVersionId: row.activeVersionId,
    ownerStatus: row.owner.status,
  });

  const portfolio: AdminPortfolioDetail = {
    ...toListItem(row),
    lastDraftSavedAt: row.lastDraftSavedAt ? row.lastDraftSavedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    visibilityReasons: visibility.reasons,
  };
  return { ok: true, portfolio };
}
