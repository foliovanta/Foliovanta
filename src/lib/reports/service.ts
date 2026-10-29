import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { AbuseReportReason, AbuseReportStatus } from "@/generated/prisma/enums";
import { type AuthzFailure, requirePermission } from "@/lib/auth/authorization";
import { recordAudit } from "@/lib/audit/audit-log";
import { commandFingerprint } from "@/lib/admin/idempotency";
import { type Cursor, type CursorPage, buildCursorPage, keysetWhere } from "@/lib/admin/pagination";
import { prisma, TRANSACTION_OPTIONS } from "@/lib/db/prisma";
import {
  PUBLICLY_VISIBLE_OWNER_WHERE,
  PUBLICLY_VISIBLE_PORTFOLIO_WHERE,
  evaluatePublicVisibility,
} from "@/lib/publishing/visibility";
import { publicPortfolioUrl } from "@/lib/urls/public-url";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_SLUG_RE = /^[1-9][0-9]{0,18}$/;
export const REPORT_DETAILS_MAX = 2000;

// ---------------------------------------------------------------------------
// Public submission (anonymous or authenticated) — ALWAYS a neutral ack
// ---------------------------------------------------------------------------

export type SubmitReportInput = {
  publicSlug: string;
  reason: AbuseReportReason;
  details?: string;
  reporterUserId?: string | null;
};

// Resolve the internal id of a PUBLICLY-ELIGIBLE portfolio by its owner's public
// slug, using the single shared visibility policy. Returns null for anything not
// publicly visible — so a hidden/suspended/unknown target is indistinguishable.
async function resolveEligiblePortfolioId(publicSlug: string): Promise<string | null> {
  if (!PUBLIC_SLUG_RE.test(publicSlug)) return null;
  const portfolio = await prisma.portfolio.findFirst({
    where: {
      ...PUBLICLY_VISIBLE_PORTFOLIO_WHERE,
      owner: { publicSlug: BigInt(publicSlug), ...PUBLICLY_VISIBLE_OWNER_WHERE },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return portfolio?.id ?? null;
}

/**
 * Create an abuse report against a publicly-eligible portfolio. Returns the SAME
 * neutral acknowledgment whether or not the target exists, is eligible, or a
 * report was actually created — never revealing hidden owner information or
 * whether enforcement followed. A report never changes portfolio visibility.
 */
export async function submitReport(input: SubmitReportInput): Promise<{ acknowledged: true }> {
  const portfolioId = await resolveEligiblePortfolioId(input.publicSlug);
  if (portfolioId) {
    const details = input.details?.trim() ? input.details.trim().slice(0, REPORT_DETAILS_MAX) : null;
    if (input.reporterUserId) {
      // Dedup an authenticated reporter's open report for the same target.
      const dup = await prisma.abuseReport.findFirst({
        where: { portfolioId, reporterUserId: input.reporterUserId, status: { in: ["OPEN", "IN_REVIEW"] } },
        select: { id: true },
      });
      if (!dup) {
        await prisma.abuseReport.create({
          data: { portfolioId, reporterUserId: input.reporterUserId, reason: input.reason, details },
        });
      }
    } else {
      await prisma.abuseReport.create({ data: { portfolioId, reason: input.reason, details } });
    }
  }
  return { acknowledged: true };
}

// ---------------------------------------------------------------------------
// Admin queue (read)
// ---------------------------------------------------------------------------

export type AdminReportListItem = {
  id: string;
  portfolioId: string;
  reason: AbuseReportReason;
  status: AbuseReportStatus;
  reporter: "anonymous" | "account"; // classification only — never identity
  createdAt: string;
};

export type AdminReportDetail = Omit<AdminReportListItem, never> & {
  details: string | null;
  resolutionNote: string | null;
  enforcementRef: string | null;
  statusChangedAt: string | null;
  resolvedAt: string | null;
  // Target context (DB-authoritative), for investigation.
  portfolioModerationStatus: string;
  portfolioPubliclyEligible: boolean;
  portfolioCanonicalUrl: string | null;
};

export type ReportFilters = { status?: AbuseReportStatus; reason?: AbuseReportReason };
export type ListReportsParams = ReportFilters & { limit: number; cursor?: Cursor };

export type ListReportsResult =
  | { ok: true; page: CursorPage<AdminReportListItem> }
  | { ok: false; failure: AuthzFailure };

export type ReportDetailResult =
  | { ok: true; report: AdminReportDetail }
  | { ok: false; failure: AuthzFailure }
  | { ok: false; error: "NOT_FOUND" };

export async function listAdminReports(params: ListReportsParams): Promise<ListReportsResult> {
  const authz = await requirePermission("admin.reports.read");
  if (!authz.ok) return { ok: false, failure: authz };

  const where: Prisma.AbuseReportWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
    ...(params.cursor ? keysetWhere("createdAt", params.cursor, "desc") : {}),
  };
  const rows = await prisma.abuseReport.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    select: { id: true, portfolioId: true, reason: true, status: true, reporterUserId: true, createdAt: true },
  });

  const page = buildCursorPage(
    rows.map((row) => ({
      id: row.id,
      portfolioId: row.portfolioId,
      reason: row.reason,
      status: row.status,
      reporter: row.reporterUserId ? ("account" as const) : ("anonymous" as const),
      createdAt: row.createdAt.toISOString(),
    })),
    params.limit,
    (item) => ({ v: item.createdAt, id: item.id }),
  );
  return { ok: true, page };
}

export async function getAdminReportDetail(id: string): Promise<ReportDetailResult> {
  const authz = await requirePermission("admin.reports.read");
  if (!authz.ok) return { ok: false, failure: authz };
  if (!UUID_RE.test(id)) return { ok: false, error: "NOT_FOUND" };

  const row = await prisma.abuseReport.findUnique({
    where: { id },
    select: {
      id: true,
      portfolioId: true,
      reason: true,
      status: true,
      details: true,
      resolutionNote: true,
      enforcementRef: true,
      reporterUserId: true,
      statusChangedAt: true,
      resolvedAt: true,
      createdAt: true,
      portfolio: {
        select: {
          publicationStatus: true,
          moderationStatus: true,
          deletedAt: true,
          activeVersionId: true,
          owner: { select: { publicSlug: true, username: true, status: true } },
        },
      },
    },
  });
  if (!row) return { ok: false, error: "NOT_FOUND" };

  const visibility = evaluatePublicVisibility({
    deletedAt: row.portfolio.deletedAt,
    publicationStatus: row.portfolio.publicationStatus,
    moderationStatus: row.portfolio.moderationStatus,
    activeVersionId: row.portfolio.activeVersionId,
    ownerStatus: row.portfolio.owner.status,
  });

  return {
    ok: true,
    report: {
      id: row.id,
      portfolioId: row.portfolioId,
      reason: row.reason,
      status: row.status,
      reporter: row.reporterUserId ? "account" : "anonymous",
      details: row.details,
      resolutionNote: row.resolutionNote,
      enforcementRef: row.enforcementRef,
      statusChangedAt: row.statusChangedAt ? row.statusChangedAt.toISOString() : null,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      portfolioModerationStatus: row.portfolio.moderationStatus,
      portfolioPubliclyEligible: visibility.eligible,
      portfolioCanonicalUrl: visibility.eligible
        ? publicPortfolioUrl(row.portfolio.owner.publicSlug.toString(), row.portfolio.owner.username)
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Triage (privileged, transactional, idempotent)
// ---------------------------------------------------------------------------

export type ReportTriageAction = "REVIEW" | "DISMISS" | "ACTION";

const REPORT_RULES: Record<ReportTriageAction, { from: AbuseReportStatus[]; to: AbuseReportStatus; audit: string }> = {
  REVIEW: { from: ["OPEN"], to: "IN_REVIEW", audit: "report.review_started" },
  DISMISS: { from: ["OPEN", "IN_REVIEW"], to: "DISMISSED", audit: "report.dismissed" },
  ACTION: { from: ["OPEN", "IN_REVIEW"], to: "ACTIONED", audit: "report.actioned" },
};

export type ReportTriageInput = {
  action: ReportTriageAction;
  expectedStatus?: AbuseReportStatus;
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

export type ReportTriageResult =
  | TriageSuccess
  | { ok: false; failure: AuthzFailure }
  | {
      ok: false;
      error: "NOT_FOUND" | "INVALID_TRANSITION" | "STATE_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "ENFORCEMENT_REQUIRED";
    };

class Abort extends Error {
  constructor(public readonly code: "NOT_FOUND" | "INVALID_TRANSITION" | "STATE_CONFLICT" | "ENFORCEMENT_REQUIRED") {
    super(code);
  }
}

export async function triageReport(id: string, input: ReportTriageInput): Promise<ReportTriageResult> {
  const authz = await requirePermission("admin.reports.triage");
  if (!authz.ok) return { ok: false, failure: authz };
  const actorUserId = authz.actor.userId;
  if (!UUID_RE.test(id)) return { ok: false, error: "NOT_FOUND" };

  const note = input.resolutionNote?.trim() ? input.resolutionNote.trim().slice(0, 2000) : null;
  const fp = commandFingerprint({ op: `report.${input.action}`, id, note, expected: input.expectedStatus ?? null });

  const existing = await prisma.moderationCommand.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.fingerprint !== fp) return { ok: false, error: "IDEMPOTENCY_CONFLICT" };
    return { ...(existing.result as TriageSuccess), replayed: true };
  }

  const rule = REPORT_RULES[input.action];
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "abuse_reports" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (locked.length === 0) throw new Abort("NOT_FOUND");
      const current = await tx.abuseReport.findUniqueOrThrow({
        where: { id },
        select: { status: true, portfolio: { select: { moderationStatus: true } } },
      });
      if (input.expectedStatus && current.status !== input.expectedStatus) throw new Abort("STATE_CONFLICT");

      const noop = current.status === rule.to;
      const applies = rule.from.includes(current.status);
      if (!noop && !applies) throw new Abort("INVALID_TRANSITION");

      // ACTIONED must reflect REAL enforcement: the target portfolio must already
      // be SUSPENDED (done via the M6.3 moderation service). Report status is
      // never the source of truth for public eligibility, and we never suspend
      // from here — no duplicated moderation logic.
      if (!noop && input.action === "ACTION" && current.portfolio.moderationStatus !== "SUSPENDED") {
        throw new Abort("ENFORCEMENT_REQUIRED");
      }

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
        await tx.abuseReport.update({
          where: { id },
          data: {
            status: rule.to,
            statusChangedAt: now,
            ...(note !== null ? { resolutionNote: note } : {}),
            ...(rule.to === "DISMISSED" || rule.to === "ACTIONED" ? { resolvedAt: now } : {}),
            ...(rule.to === "ACTIONED" ? { enforcementRef: input.correlationId } : {}),
          },
        });
        await recordAudit(
          {
            action: rule.audit,
            actorUserId,
            targetType: "abuse_report",
            targetId: id,
            outcome: "SUCCESS",
            correlationId: input.correlationId,
            // Never log the report details text.
            metadata: { fromState: current.status, toState: rule.to, hasNote: note !== null, idempotencyKey: input.idempotencyKey },
          },
          tx,
        );
      }

      await tx.moderationCommand.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          actorUserId,
          operation: `report.${input.action}`,
          targetType: "abuse_report",
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
