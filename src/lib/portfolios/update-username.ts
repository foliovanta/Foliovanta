import "server-only";

import { prisma } from "@/lib/db/prisma";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";
import { normalizeUsername } from "@/lib/utils/username";

export type UpdateUsernameError = PortfolioAccessError | "NOT_FOUND" | "INVALID_USERNAME";

export type UpdateUsernameResult =
  { ok: true; username: string } | { ok: false; error: UpdateUsernameError };

/**
 * Set the owner's editable URL username. Scoped to a portfolio the caller owns
 * so one account can never change another's username. The username is non-unique
 * and the public identity is the immutable numeric publicSlug, so a username
 * change never affects URL identity, snapshots, or publishing.
 */
export async function updateUsername(
  clerkUserId: string,
  portfolioId: string,
  rawUsername: string,
): Promise<UpdateUsernameResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  const username = normalizeUsername(rawUsername);
  if (!username) {
    return { ok: false, error: "INVALID_USERNAME" };
  }

  // Ownership predicate: a non-owned or soft-deleted portfolio is a 404.
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: { id: true },
  });
  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  // Non-unique presentation field with no cross-field invariant → last-write-wins
  // is correct; no optimistic-concurrency revision needed.
  const updated = await prisma.user.update({
    where: { id: resolved.userId },
    data: { username },
    select: { username: true },
  });

  return { ok: true, username: updated.username };
}
