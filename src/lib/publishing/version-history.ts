import "server-only";

import { prisma } from "@/lib/db/prisma";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";

export type VersionSummary = {
  versionNumber: number;
  publishedAt: Date;
  templateId: string;
  templateVersion: string;
  isActive: boolean;
};

export type VersionHistoryResult =
  | { ok: true; versions: VersionSummary[]; nextCursor: number | null }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Owner-scoped, read-only, paginated version metadata (newest first). Never
 * returns the snapshot JSON — only the fields needed to list versions.
 */
export async function listPortfolioVersions(
  clerkUserId: string,
  portfolioId: string,
  options: { cursor?: number; limit?: number } = {},
): Promise<VersionHistoryResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: { activeVersion: { select: { versionNumber: true } } },
  });
  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const take = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const rows = await prisma.portfolioVersion.findMany({
    where: { portfolioId },
    orderBy: { versionNumber: "desc" },
    take: take + 1,
    ...(options.cursor !== undefined
      ? { cursor: { portfolioId_versionNumber: { portfolioId, versionNumber: options.cursor } }, skip: 1 }
      : {}),
    select: { versionNumber: true, publishedAt: true, templateId: true, templateVersion: true },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const activeVersionNumber = portfolio.activeVersion?.versionNumber ?? null;

  return {
    ok: true,
    versions: page.map((row) => ({ ...row, isActive: row.versionNumber === activeVersionNumber })),
    nextCursor: hasMore ? (page[page.length - 1]?.versionNumber ?? null) : null,
  };
}
