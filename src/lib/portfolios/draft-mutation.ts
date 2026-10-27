import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma, TRANSACTION_OPTIONS } from "@/lib/db/prisma";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";

// Revisions are unbounded (BigInt). Accept a numeric string or a safe integer
// and normalize to bigint; clients send and receive revisions as strings.
export const expectedRevisionSchema = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform((value) => BigInt(value));

export type DraftMutationFailure = PortfolioAccessError | "NOT_FOUND" | "REVISION_CONFLICT";

export type DraftWorkResult<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Thrown to roll back the transaction (and the revision bump) when the
// caller's work reports a domain failure. Never escapes this module.
class AbortDraftMutation extends Error {
  constructor(readonly failure: unknown) {
    super("draft mutation aborted");
  }
}

/**
 * Runs an owner-scoped draft mutation under optimistic concurrency.
 *
 * In one transaction it conditionally bumps `Portfolio.draftRevision` only when
 * it still equals `expectedRevision` (ownership and soft-delete are part of the
 * same WHERE), then runs `work`. The revision check lives in the write, not a
 * prior read, so two requests with the same expected revision cannot both
 * succeed. If `work` reports a failure the whole transaction — including the
 * bump — rolls back, so there is never a partial write.
 */
export async function mutateDraft<T, E = never>(
  clerkUserId: string,
  portfolioId: string,
  expectedRevision: bigint,
  work: (tx: Prisma.TransactionClient, ownerId: string) => Promise<DraftWorkResult<T, E>>,
): Promise<
  { ok: true; value: T; revision: bigint } | { ok: false; error: DraftMutationFailure | E }
> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  const ownerId = resolved.userId;
  const newRevision = expectedRevision + BigInt(1);

  try {
    return await prisma.$transaction(async (tx) => {
      const bumped = await tx.portfolio.updateMany({
        where: { id: portfolioId, ownerId, deletedAt: null, draftRevision: expectedRevision },
        data: { draftRevision: { increment: 1 }, lastDraftSavedAt: new Date() },
      });

      if (bumped.count === 0) {
        const exists = await tx.portfolio.findFirst({
          where: { id: portfolioId, ownerId, deletedAt: null },
          select: { id: true },
        });
        return { ok: false, error: exists ? "REVISION_CONFLICT" : "NOT_FOUND" } as const;
      }

      const result = await work(tx, ownerId);
      if (!result.ok) {
        throw new AbortDraftMutation(result.error);
      }

      return { ok: true, value: result.value, revision: newRevision } as const;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof AbortDraftMutation) {
      return { ok: false, error: error.failure as E };
    }
    throw error;
  }
}
