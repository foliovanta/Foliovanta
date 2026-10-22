import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  MAX_PORTFOLIO_SLUG_LENGTH,
  isReservedPortfolioSlug,
  normalizePortfolioSlug,
} from "@/lib/utils/slug";

export type CreatePortfolioInput = {
  clerkUserId: string;
  slug: string;
  title?: string;
};

export type CreatedPortfolio = Prisma.PortfolioGetPayload<{
  select: {
    id: true;
    slug: true;
    title: true;
    publicationStatus: true;
    moderationStatus: true;
    createdAt: true;
  };
}>;

export type CreatePortfolioError =
  | "USER_NOT_SYNCED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_UNAVAILABLE"
  | "INVALID_SLUG"
  | "SLUG_RESERVED"
  | "SLUG_TAKEN"
  | "PORTFOLIO_LIMIT_REACHED";

export type CreatePortfolioResult =
  { ok: true; portfolio: CreatedPortfolio } | { ok: false; error: CreatePortfolioError };

export async function createPortfolio(input: CreatePortfolioInput): Promise<CreatePortfolioResult> {
  const slug = normalizePortfolioSlug(input.slug);

  if (slug.length === 0 || slug.length > MAX_PORTFOLIO_SLUG_LENGTH) {
    return { ok: false, error: "INVALID_SLUG" };
  }

  if (isReservedPortfolioSlug(slug)) {
    return { ok: false, error: "SLUG_RESERVED" };
  }

  // Clerk authenticates; the database is the authority. Resolve the internal
  // user and never auto-create it here (provisioning is the webhook's job).
  const user = await prisma.user.findUnique({
    where: { clerkUserId: input.clerkUserId },
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

  const title = input.title?.trim() || null;

  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize concurrent creates for this owner so the one-portfolio MVP
      // entitlement holds without a permanent UNIQUE(ownerId) that would block
      // future multi-portfolio plans (BACKEND_SCHEMA.md §3.3).
      await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(
         hashtext(${user.id})
      ) IS NULL AS locked
    `;
      const existing = await tx.portfolio.count({
        where: { ownerId: user.id, deletedAt: null },
      });

      if (existing > 0) {
        return { ok: false, error: "PORTFOLIO_LIMIT_REACHED" } as const;
      }

      const portfolio = await tx.portfolio.create({
        data: { ownerId: user.id, slug, title },
        select: {
          id: true,
          slug: true,
          title: true,
          publicationStatus: true,
          moderationStatus: true,
          createdAt: true,
        },
      });

      return { ok: true, portfolio } as const;
    });
  } catch (error) {
    // The unique slug index guards cross-owner slug races; surface it as a
    // clean conflict without leaking the constraint name or SQL.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "SLUG_TAKEN" };
    }

    throw error;
  }
}
