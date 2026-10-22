import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type PortfolioAccessError = "USER_NOT_SYNCED" | "ACCOUNT_SUSPENDED" | "ACCOUNT_UNAVAILABLE";

// Explicit select: expose the owner-facing summary only. Internal fields
// (ownerId, draftRevision, nextVersionNumber, deletedAt) are never returned.
const portfolioSummarySelect = {
  id: true,
  slug: true,
  title: true,
  publicationStatus: true,
  moderationStatus: true,
  lastDraftSavedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PortfolioSelect;

export type PortfolioSummary = Prisma.PortfolioGetPayload<{
  select: typeof portfolioSummarySelect;
}>;

type ResolvedUser = { ok: true; userId: string } | { ok: false; error: PortfolioAccessError };

// Clerk authenticates; the database authorizes. Never auto-create here.
export async function resolveActiveUser(clerkUserId: string): Promise<ResolvedUser> {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, status: true },
  });

  if (!user) {
    return { ok: false, error: "USER_NOT_SYNCED" };
  }

  if (user.status !== "ACTIVE") {
    return {
      ok: false,
      error: user.status === "SUSPENDED" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_UNAVAILABLE",
    };
  }

  return { ok: true, userId: user.id };
}

export async function listPortfolios(
  clerkUserId: string,
): Promise<
  { ok: true; portfolios: PortfolioSummary[] } | { ok: false; error: PortfolioAccessError }
> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  const portfolios = await prisma.portfolio.findMany({
    where: { ownerId: resolved.userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: portfolioSummarySelect,
  });

  return { ok: true, portfolios };
}

export async function getPortfolioById(
  clerkUserId: string,
  portfolioId: string,
): Promise<
  | { ok: true; portfolio: PortfolioSummary }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" }
> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  // Ownership is part of the predicate, so another user's (or a soft-deleted)
  // portfolio is indistinguishable from a nonexistent one.
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: portfolioSummarySelect,
  });

  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  return { ok: true, portfolio };
}
