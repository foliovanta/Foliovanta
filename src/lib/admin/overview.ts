import "server-only";

import { prisma } from "@/lib/db/prisma";

export type AdminOverview = {
  totalUsers: number;
  activePortfolios: number;
  publishedPortfolios: number;
};

/**
 * Minimal, privacy-safe operational counts for the admin overview. Returns only
 * aggregates — never any personal data.
 *
 * Definitions (precise and stable):
 * - `totalUsers`: user accounts that are not tombstoned for deletion
 *   (DELETION_PENDING excluded); counts ACTIVE and SUSPENDED accounts.
 * - `activePortfolios`: portfolios that are not soft-deleted.
 * - `publishedPortfolios`: portfolios currently publicly visible — the same
 *   predicate the public read uses (published, not moderated off, not deleted,
 *   with an active version), so the number matches what visitors can actually
 *   reach.
 *
 * Three indexed COUNTs run concurrently; no row data is loaded.
 */
export async function getAdminOverview(): Promise<AdminOverview> {
  const [totalUsers, activePortfolios, publishedPortfolios] = await Promise.all([
    prisma.user.count({ where: { status: { not: "DELETION_PENDING" } } }),
    prisma.portfolio.count({ where: { deletedAt: null } }),
    prisma.portfolio.count({
      where: {
        deletedAt: null,
        publicationStatus: "PUBLISHED",
        moderationStatus: { not: "SUSPENDED" },
        activeVersionId: { not: null },
      },
    }),
  ]);
  return { totalUsers, activePortfolios, publishedPortfolios };
}
