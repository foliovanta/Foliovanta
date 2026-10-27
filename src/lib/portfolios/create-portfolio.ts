import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma, TRANSACTION_OPTIONS } from "@/lib/db/prisma";
import { MAX_PORTFOLIO_SLUG_LENGTH, normalizePortfolioSlug } from "@/lib/utils/slug";

export type CreatePortfolioInput = {
  clerkUserId: string;
  title?: string;
};

// The public URL is /{publicSlug}/{username}; the portfolio slug is now an
// internal, server-generated identifier (kept for legacy snapshots/links). A
// random suffix keeps it unique even across soft-deleted rows (whose slug the
// full unique index still reserves).
function generateInternalSlug(title: string | null): string {
  const base = normalizePortfolioSlug(title ?? "") || "portfolio";
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${base.slice(0, MAX_PORTFOLIO_SLUG_LENGTH - suffix.length - 1)}-${suffix}`;
}

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
  | "PORTFOLIO_LIMIT_REACHED";

// Random-suffixed slugs essentially never collide; retry a few times before
// surfacing a failure so a one-in-a-billion clash can't fail a create.
const MAX_SLUG_ATTEMPTS = 5;

export type CreatePortfolioResult =
  { ok: true; portfolio: CreatedPortfolio } | { ok: false; error: CreatePortfolioError };

export async function createPortfolio(input: CreatePortfolioInput): Promise<CreatePortfolioResult> {
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

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = generateInternalSlug(title);
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
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      // The full unique slug index (incl. soft-deleted rows) can still collide;
      // regenerate and retry rather than surfacing it to the user.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }

  // Exhausting random suffixes is not a user-correctable condition.
  throw new Error("Failed to allocate a unique portfolio slug after retries");
}
