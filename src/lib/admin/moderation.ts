import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import type { PortfolioModerationStatus, UserStatus } from "@/generated/prisma/enums";
import { type AuthzFailure, requirePermission } from "@/lib/auth/authorization";
import { recordAudit } from "@/lib/audit/audit-log";
import { prisma, TRANSACTION_OPTIONS } from "@/lib/db/prisma";
import {
  type AccountModerationAction,
  type PortfolioModerationAction,
  accountReasonRequired,
  portfolioReasonRequired,
  resolveAccountTransition,
  resolvePortfolioTransition,
  validateReason,
} from "@/lib/admin/moderation-policy";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ModerationSuccess = {
  ok: true;
  targetType: "portfolio" | "user";
  targetId: string;
  previousState: string;
  newState: string;
  changed: boolean; // false => the target was already in the target state
  replayed: boolean; // true => returned from the idempotency ledger, not re-applied
};

type PortfolioError =
  | "NOT_FOUND"
  | "REASON_REQUIRED"
  | "INVALID_TRANSITION"
  | "STATE_CONFLICT"
  | "IDEMPOTENCY_CONFLICT";

type AccountError = PortfolioError | "SELF_TARGET" | "ADMIN_TARGET";

export type PortfolioModerationResult =
  | ModerationSuccess
  | { ok: false; failure: AuthzFailure }
  | { ok: false; error: PortfolioError };

export type AccountModerationResult =
  | ModerationSuccess
  | { ok: false; failure: AuthzFailure }
  | { ok: false; error: AccountError };

export type PortfolioModerationInput = {
  action: PortfolioModerationAction;
  reason?: string;
  expectedModerationStatus?: PortfolioModerationStatus;
  idempotencyKey: string;
  correlationId: string;
};

export type AccountModerationInput = {
  action: AccountModerationAction;
  reason?: string;
  expectedStatus?: UserStatus;
  idempotencyKey: string;
  correlationId: string;
};

// Thrown inside a transaction to roll it back with a typed domain code (so an
// invalid transition / conflict commits nothing — no state, no audit, no ledger).
class DomainAbort extends Error {
  constructor(public readonly code: AccountError) {
    super(code);
  }
}

function fingerprint(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export type ModerationNote = {
  action: string;
  reason: string | null;
  fromState: string | null;
  toState: string | null;
  at: string;
};

/**
 * The most recent successful moderation state-change for a target, from the
 * audit log (the source of truth). Used to show "why" on the admin detail pages.
 * Denied attempts (outcome DENIED) are excluded.
 */
export async function getLatestModerationNote(
  targetType: "portfolio" | "user",
  targetId: string,
): Promise<ModerationNote | null> {
  const row = await prisma.auditLog.findFirst({
    where: { targetType, targetId, action: { startsWith: "moderation." }, outcome: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    select: { action: true, metadata: true, createdAt: true },
  });
  if (!row) return null;
  const m = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    action: row.action,
    reason: typeof m.reason === "string" ? m.reason : null,
    fromState: typeof m.fromState === "string" ? m.fromState : null,
    toState: typeof m.toState === "string" ? m.toState : null,
    at: row.createdAt.toISOString(),
  };
}

function replay(
  row: { fingerprint: string; result: unknown },
  fp: string,
): ModerationSuccess | { ok: false; error: "IDEMPOTENCY_CONFLICT" } {
  // Same key, different payload → reject. Same key + payload → original result.
  if (row.fingerprint !== fp) return { ok: false, error: "IDEMPOTENCY_CONFLICT" };
  return { ...(row.result as ModerationSuccess), replayed: true };
}

export async function moderatePortfolio(
  portfolioId: string,
  input: PortfolioModerationInput,
): Promise<PortfolioModerationResult> {
  const authz = await requirePermission("admin.portfolios.moderate");
  if (!authz.ok) return { ok: false, failure: authz };
  const actorUserId = authz.actor.userId;

  if (!UUID_RE.test(portfolioId)) return { ok: false, error: "NOT_FOUND" };

  const reasonCheck = validateReason(input.reason, portfolioReasonRequired(input.action));
  if (!reasonCheck.ok) return { ok: false, error: "REASON_REQUIRED" };
  const reason = reasonCheck.reason;

  const fp = fingerprint({
    operation: `portfolio.${input.action}`,
    portfolioId,
    reason,
    expected: input.expectedModerationStatus ?? null,
  });

  const existing = await prisma.moderationCommand.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return replay(existing, fp);

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "portfolios"
        WHERE "id" = ${portfolioId}::uuid AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0) throw new DomainAbort("NOT_FOUND");

      const portfolio = await tx.portfolio.findUniqueOrThrow({
        where: { id: portfolioId },
        select: { moderationStatus: true },
      });

      if (
        input.expectedModerationStatus &&
        portfolio.moderationStatus !== input.expectedModerationStatus
      ) {
        throw new DomainAbort("STATE_CONFLICT");
      }

      const transition = resolvePortfolioTransition(input.action, portfolio.moderationStatus);
      if (transition.kind === "invalid") throw new DomainAbort("INVALID_TRANSITION");

      const previousState = portfolio.moderationStatus;
      const result: ModerationSuccess = {
        ok: true,
        targetType: "portfolio",
        targetId: portfolioId,
        previousState,
        newState: transition.kind === "apply" ? transition.to : previousState,
        changed: transition.kind === "apply",
        replayed: false,
      };

      if (transition.kind === "apply") {
        await tx.portfolio.update({
          where: { id: portfolioId },
          data: { moderationStatus: transition.to },
        });
        // Audit inside the transaction — if this insert fails, the state change
        // rolls back with it (never a state change without its audit record).
        await recordAudit(
          {
            action: `moderation.portfolio.${input.action.toLowerCase()}`,
            actorUserId,
            targetType: "portfolio",
            targetId: portfolioId,
            outcome: "SUCCESS",
            correlationId: input.correlationId,
            metadata: {
              fromState: previousState,
              toState: transition.to,
              reason,
              idempotencyKey: input.idempotencyKey,
              ...(transition.restrictive
                ? {
                    revocation: {
                      mechanism: "db-authoritative-no-store",
                      surfaces: ["public-page", "legacy-route", "sitemap", "og-image", "media"],
                    },
                  }
                : {}),
            },
          },
          tx,
        );
      }

      await tx.moderationCommand.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          actorUserId,
          operation: `portfolio.${input.action}`,
          targetType: "portfolio",
          targetId: portfolioId,
          fingerprint: fp,
          result: result as unknown as Prisma.InputJsonValue,
        },
      });

      return result;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    return (await handleCommandError(error, input.idempotencyKey, fp)) as PortfolioModerationResult;
  }
}

export async function moderateAccount(
  userId: string,
  input: AccountModerationInput,
): Promise<AccountModerationResult> {
  const authz = await requirePermission("admin.users.suspend");
  if (!authz.ok) return { ok: false, failure: authz };
  const actorUserId = authz.actor.userId;

  if (!UUID_RE.test(userId)) return { ok: false, error: "NOT_FOUND" };
  // Never let an administrator restrict their own account.
  if (userId === actorUserId) return { ok: false, error: "SELF_TARGET" };

  const reasonCheck = validateReason(input.reason, accountReasonRequired(input.action));
  if (!reasonCheck.ok) return { ok: false, error: "REASON_REQUIRED" };
  const reason = reasonCheck.reason;

  const fp = fingerprint({
    operation: `account.${input.action}`,
    userId,
    reason,
    expected: input.expectedStatus ?? null,
  });

  const existing = await prisma.moderationCommand.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return replay(existing, fp);

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
      `;
      if (locked.length === 0) throw new DomainAbort("NOT_FOUND");

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { status: true, role: true },
      });

      // Policy: account suspension targets only USER-role accounts. Admin-on-admin
      // restriction (and self/last-super-admin loss) requires a separate approved
      // policy and is out of scope for M6.3.
      if (user.role !== "USER") throw new DomainAbort("ADMIN_TARGET");

      if (input.expectedStatus && user.status !== input.expectedStatus) {
        throw new DomainAbort("STATE_CONFLICT");
      }

      const transition = resolveAccountTransition(input.action, user.status);
      if (transition.kind === "invalid") throw new DomainAbort("INVALID_TRANSITION");

      const previousState = user.status;
      const result: ModerationSuccess = {
        ok: true,
        targetType: "user",
        targetId: userId,
        previousState,
        newState: transition.kind === "apply" ? transition.to : previousState,
        changed: transition.kind === "apply",
        replayed: false,
      };

      if (transition.kind === "apply") {
        await tx.user.update({ where: { id: userId }, data: { status: transition.to } });
        await recordAudit(
          {
            action: `moderation.account.${input.action.toLowerCase()}`,
            actorUserId,
            targetType: "user",
            targetId: userId,
            outcome: "SUCCESS",
            correlationId: input.correlationId,
            metadata: {
              fromState: previousState,
              toState: transition.to,
              reason,
              idempotencyKey: input.idempotencyKey,
              ...(transition.restrictive
                ? {
                    revocation: {
                      mechanism: "db-authoritative-no-store",
                      surfaces: ["all-owner-portfolios", "owner-admin-access"],
                    },
                  }
                : {}),
            },
          },
          tx,
        );
      }

      await tx.moderationCommand.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          actorUserId,
          operation: `account.${input.action}`,
          targetType: "user",
          targetId: userId,
          fingerprint: fp,
          result: result as unknown as Prisma.InputJsonValue,
        },
      });

      return result;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    return (await handleCommandError(error, input.idempotencyKey, fp)) as AccountModerationResult;
  }
}

// Map a rolled-back transaction to its typed result. A concurrent request that
// won the unique idempotency key (P2002) replays that stored result. Returns the
// broad (account) union; callers narrow-cast to their own result type.
async function handleCommandError(
  error: unknown,
  idempotencyKey: string,
  fp: string,
): Promise<ModerationSuccess | { ok: false; error: AccountError }> {
  if (error instanceof DomainAbort) {
    return { ok: false, error: error.code };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const row = await prisma.moderationCommand.findUnique({ where: { idempotencyKey } });
    return row ? replay(row, fp) : { ok: false, error: "IDEMPOTENCY_CONFLICT" };
  }
  throw error;
}
