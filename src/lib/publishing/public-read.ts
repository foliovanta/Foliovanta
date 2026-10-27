import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isReservedPortfolioSlug, normalizePortfolioSlug } from "@/lib/utils/slug";
import {
  type PublishedSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  publishedSnapshotSchema,
} from "@/lib/publishing/snapshot";

/**
 * Unauthenticated read of the active published snapshot for a slug.
 *
 * Reads ONLY the immutable published version via the active-version pointer —
 * never draft content. Every non-visible case (missing, unpublished, suspended,
 * soft-deleted, ineligible owner, missing/invalid/unsupported snapshot) returns
 * the same NOT_FOUND so existence is never leaked.
 */
export type PublicPortfolioResult =
  | {
      ok: true;
      snapshot: PublishedSnapshot;
      versionNumber: number;
      publicSlug: string;
      username: string;
    }
  | { ok: false; error: "NOT_FOUND" };

const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

// Decimal, no leading zeros, within BigInt range. publicSlug starts at 10000,
// so real values always pass; this just rejects junk before touching the DB.
const PUBLIC_SLUG_PATTERN = /^[1-9][0-9]{0,18}$/;

// Shared visibility predicate: a portfolio is publicly readable only when it is
// published, not moderated off, not soft-deleted, has an active version, and is
// owned by an active account. Every non-visible case collapses to NOT_FOUND.
const publiclyVisibleWhere = {
  deletedAt: null,
  publicationStatus: "PUBLISHED",
  moderationStatus: { not: "SUSPENDED" },
  activeVersionId: { not: null },
} as const;

const activeVersionSelect = {
  owner: { select: { publicSlug: true, username: true } },
  activeVersion: {
    select: { versionNumber: true, schemaVersion: true, snapshot: true },
  },
} as const;

type PortfolioRow = {
  owner: { publicSlug: bigint; username: string };
  activeVersion: { versionNumber: number; schemaVersion: number; snapshot: unknown } | null;
};

// Validate the stored snapshot and shape the public result. URL identity
// (publicSlug + username) comes from the LIVE owner, never the snapshot — so a
// username edit never rewrites history or forces a republish.
function toPublicResult(portfolio: PortfolioRow | null): PublicPortfolioResult {
  if (!portfolio?.activeVersion) {
    return NOT_FOUND;
  }

  const { versionNumber, schemaVersion, snapshot } = portfolio.activeVersion;

  if (schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    console.error("Public portfolio snapshot has an unsupported schemaVersion", { schemaVersion });
    return NOT_FOUND;
  }

  const parsed = publishedSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    console.error("Public portfolio snapshot failed validation");
    return NOT_FOUND;
  }

  return {
    ok: true,
    snapshot: parsed.data,
    versionNumber,
    publicSlug: portfolio.owner.publicSlug.toString(),
    username: portfolio.owner.username,
  };
}

/**
 * Primary public read: resolve the active published snapshot by the user's
 * numeric publicSlug. Identity is NEVER resolved by username.
 */
export async function getPublicPortfolioByUserSlug(
  rawPublicSlug: string,
): Promise<PublicPortfolioResult> {
  if (!PUBLIC_SLUG_PATTERN.test(rawPublicSlug)) {
    return NOT_FOUND;
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: {
      ...publiclyVisibleWhere,
      owner: { publicSlug: BigInt(rawPublicSlug), status: "ACTIVE" },
    },
    // Deterministic pick in case future plans allow multiple portfolios.
    orderBy: { createdAt: "asc" },
    select: activeVersionSelect,
  });

  return toPublicResult(portfolio);
}

/**
 * Legacy /p/{slug} read by the (now internal) portfolio slug. Kept so the JSON
 * API and the legacy-link redirect can still resolve existing published slugs.
 */
export async function getPublicPortfolio(rawSlug: string): Promise<PublicPortfolioResult> {
  // Canonicalize so lookup is case/diacritic-insensitive and matches stored
  // slugs. Reserved or empty slugs can never be a real portfolio.
  const slug = normalizePortfolioSlug(rawSlug);
  if (!slug || isReservedPortfolioSlug(slug)) {
    return NOT_FOUND;
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { ...publiclyVisibleWhere, slug, owner: { status: "ACTIVE" } },
    select: activeVersionSelect,
  });

  return toPublicResult(portfolio);
}
