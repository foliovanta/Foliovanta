import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { FeedbackCategory, FeedbackStatus } from "@/generated/prisma/enums";
import { type AuthzFailure, requirePermission } from "@/lib/auth/authorization";
import { recordAudit } from "@/lib/audit/audit-log";
import { commandFingerprint } from "@/lib/admin/idempotency";
import { type Cursor, type CursorPage, buildCursorPage, keysetWhere } from "@/lib/admin/pagination";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";
import { prisma, TRANSACTION_OPTIONS } from "@/lib/db/prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FEEDBACK_MESSAGE_MAX = 4000;

// ---------------------------------------------------------------------------
// Submission (authenticated creator)
// ---------------------------------------------------------------------------

export type SubmitFeedbackInput = {
  category: FeedbackCategory;
  message: string;
  portfolioId?: string;
};

export type SubmitFeedbackResult =
  | { ok: true; id: string; deduped: boolean }
  | { ok: false; error: PortfolioAccessError | "PORTFOLIO_NOT_OWNED" };

export async function submitFeedback(
  clerkUserId: string,
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) return resolved;
  const userId = resolved.userId;

  // Optional portfolio reference is accepted ONLY if the submitter owns it.
  let portfolioId: string | null = null;
  if (input.portfolioId) {
    if (!UUID_RE.test(input.portfolioId)) return { ok: false, error: "PORTFOLIO_NOT_OWNED" };
    const owned = await prisma.portfolio.findFirst({
      where: { id: input.portfolioId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "PORTFOLIO_NOT_OWNED" };
    portfolioId = owned.id;
  }

  // Duplicate guard: an identical OPEN submission in the last 5 minutes returns
  // the existing id rather than creating a near-duplicate.
  const since = new Date(Date.now() - 5 * 60_000);
  const dup = await prisma.feedback.findFirst({
    where: { userId, category: input.category, message: input.message, status: "OPEN", createdAt: { gte: since } },
    select: { id: true },
  });
  if (dup) return { ok: true, id: dup.id, deduped: true };

  const row = await prisma.feedback.create({
    data: { userId, portfolioId, category: input.category, message: input.message },
    select: { id: true },
  });
  return { ok: true, id: row.id, deduped: false };
}

// ---------------------------------------------------------------------------
// Admin queue (read)
// ---------------------------------------------------------------------------

export type AdminFeedbackListItem = {
  id: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  preview: string;
  submitterName: string;
  submitterPublicSlug: string;
  hasPortfolio: boolean;
  createdAt: string;
};

export type AdminFeedbackDetail = Omit<AdminFeedbackListItem, "preview"> & {
  message: string;
  submitterId: string;
  portfolioId: string | null;
  resolutionNote: string | null;
  statusChangedAt: string | null;
  resolvedAt: string | null;
  updatedAt: string;
};

export type FeedbackFilters = { status?: FeedbackStatus; category?: FeedbackCategory };
export type ListFeedbackParams = FeedbackFilters & { limit: number; cursor?: Cursor };

export type ListFeedbackResult =
  | { ok: true; page: CursorPage<AdminFeedbackListItem> }
  | { ok: false; failure: AuthzFailure };

export type FeedbackDetailResult =
  | { ok: true; feedback: AdminFeedbackDetail }
  | { ok: false; failure: AuthzFailure }
  | { ok: false; error: "NOT_FOUND" };

function submitterName(name: string | null, publicSlug: bigint): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `User ${publicSlug.toString()}`;
}

const listSelect = {
  id: true,
  category: true,
  status: true,
  message: true,
  portfolioId: true,
  createdAt: true,
  user: { select: { name: true, publicSlug: true } },
} satisfies Prisma.FeedbackSelect;

export async function listAdminFeedback(params: ListFeedbackParams): Promise<ListFeedbackResult> {
  const authz = await requirePermission("admin.feedback.read");
  if (!authz.ok) return { ok: false, failure: authz };

  const where: Prisma.FeedbackWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(params.cursor ? keysetWhere("createdAt", params.cursor, "desc") : {}),
  };
  const rows = await prisma.feedback.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    select: listSelect,
  });

  const page = buildCursorPage(
    rows.map((row) => ({
      id: row.id,
      category: row.category,
      status: row.status,
      preview: row.message.slice(0, 140),
      submitterName: submitterName(row.user.name, row.user.publicSlug),
      submitterPublicSlug: row.user.publicSlug.toString(),
      hasPortfolio: row.portfolioId !== null,
      createdAt: row.createdAt.toISOString(),
    })),
    params.limit,
    (item) => ({ v: item.createdAt, id: item.id }),
  );
  return { ok: true, page };
}

export async function getAdminFeedbackDetail(id: string): Promise<FeedbackDetailResult> {
  const authz = await requirePermission("admin.feedback.read");
  if (!authz.ok) return { ok: false, failure: authz };
  if (!UUID_RE.test(id)) return { ok: false, error: "NOT_FOUND" };

  const row = await prisma.feedback.findUnique({
    where: { id },
    select: {
      ...listSelect,
      userId: true,
      resolutionNote: true,
      statusChangedAt: true,
      resolvedAt: true,
      updatedAt: true,
    },
  });
  if (!row) return { ok: false, error: "NOT_FOUND" };

  return {
    ok: true,
    feedback: {
      id: row.id,
      category: row.category,
      status: row.status,
      message: row.message,
      submitterId: row.userId,
      submitterName: submitterName(row.user.name, row.user.publicSlug),
      submitterPublicSlug: row.user.publicSlug.toString(),
      hasPortfolio: row.portfolioId !== null,
      portfolioId: row.portfolioId,
      resolutionNote: row.resolutionNote,
      statusChangedAt: row.statusChangedAt ? row.statusChangedAt.toISOString() : null,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Triage (privileged, transactional, idempotent)
// ---------------------------------------------------------------------------

export type FeedbackTriageAction = "REVIEW" | "RESOLVE" | "CLOSE";

const FEEDBACK_RULES: Record<FeedbackTriageAction, { from: FeedbackStatus[]; to: FeedbackStatus; audit: string }> = {
  REVIEW: { from: ["OPEN"], to: "IN_REVIEW", audit: "feedback.review_started" },
  RESOLVE: { from: ["OPEN", "IN_REVIEW"], to: "RESOLVED", audit: "feedback.resolved" },
  CLOSE: { from: ["OPEN", "IN_REVIEW", "RESOLVED"], to: "CLOSED", audit: "feedback.closed" },
};

export type FeedbackTriageInput = {
  action: FeedbackTriageAction;
  expectedStatus?: FeedbackStatus;
  resolutionNote?: string;
  idempotencyKey: string;
  correlationId: string;
};

export type TriageSuccess = {
  ok: true;
  id: string;
  previousState: string;
  newState: string;
  changed: boolean;
  replayed: boolean;
};

export type FeedbackTriageResult =
  | TriageSuccess
  | { ok: false; failure: AuthzFailure }
  | { ok: false; error: "NOT_FOUND" | "INVALID_TRANSITION" | "STATE_CONFLICT" | "IDEMPOTENCY_CONFLICT" };

class Abort extends Error {
  constructor(public readonly code: "NOT_FOUND" | "INVALID_TRANSITION" | "STATE_CONFLICT") {
    super(code);
  }
}

export async function triageFeedback(
  id: string,
  input: FeedbackTriageInput,
): Promise<FeedbackTriageResult> {
  const authz = await requirePermission("admin.feedback.triage");
  if (!authz.ok) return { ok: false, failure: authz };
  const actorUserId = authz.actor.userId;
  if (!UUID_RE.test(id)) return { ok: false, error: "NOT_FOUND" };

  const note = input.resolutionNote?.trim() ? input.resolutionNote.trim().slice(0, 2000) : null;
  const fp = commandFingerprint({ op: `feedback.${input.action}`, id, note, expected: input.expectedStatus ?? null });

  const existing = await prisma.moderationCommand.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.fingerprint !== fp) return { ok: false, error: "IDEMPOTENCY_CONFLICT" };
    return { ...(existing.result as TriageSuccess), replayed: true };
  }

  const rule = FEEDBACK_RULES[input.action];
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "feedback" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (locked.length === 0) throw new Abort("NOT_FOUND");
      const current = await tx.feedback.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (input.expectedStatus && current.status !== input.expectedStatus) throw new Abort("STATE_CONFLICT");

      const noop = current.status === rule.to;
      const applies = rule.from.includes(current.status);
      if (!noop && !applies) throw new Abort("INVALID_TRANSITION");

      const now = new Date();
      const result: TriageSuccess = {
        ok: true,
        id,
        previousState: current.status,
        newState: noop ? current.status : rule.to,
        changed: !noop,
        replayed: false,
      };

      if (!noop) {
        await tx.feedback.update({
          where: { id },
          data: {
            status: rule.to,
            statusChangedAt: now,
            ...(note !== null ? { resolutionNote: note } : {}),
            ...(rule.to === "RESOLVED" || rule.to === "CLOSED" ? { resolvedAt: now } : {}),
          },
        });
        await recordAudit(
          {
            action: rule.audit,
            actorUserId,
            targetType: "feedback",
            targetId: id,
            outcome: "SUCCESS",
            correlationId: input.correlationId,
            // Never log the feedback message itself.
            metadata: { fromState: current.status, toState: rule.to, hasNote: note !== null, idempotencyKey: input.idempotencyKey },
          },
          tx,
        );
      }

      await tx.moderationCommand.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          actorUserId,
          operation: `feedback.${input.action}`,
          targetType: "feedback",
          targetId: id,
          fingerprint: fp,
          result: result as unknown as Prisma.InputJsonValue,
        },
      });
      return result;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof Abort) return { ok: false, error: error.code };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await prisma.moderationCommand.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (row && row.fingerprint === fp) return { ...(row.result as TriageSuccess), replayed: true };
      return { ok: false, error: "IDEMPOTENCY_CONFLICT" };
    }
    throw error;
  }
}
