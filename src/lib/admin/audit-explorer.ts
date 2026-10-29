import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AuditOutcome } from "@/generated/prisma/enums";
import { type AuthzFailure, requirePermission } from "@/lib/auth/authorization";
import {
  type AuditActionFamily,
  type SafeAuditMetadata,
  auditActionFamily,
  safeAuditSummary,
  sanitizeAuditMetadata,
} from "@/lib/admin/audit-sanitize";
import { type Cursor, type CursorPage, buildCursorPage, keysetWhere } from "@/lib/admin/pagination";
import { prisma } from "@/lib/db/prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminAuditListItem = {
  id: string;
  createdAt: string;
  action: string;
  family: AuditActionFamily;
  outcome: AuditOutcome;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  correlationId: string | null;
  summary: string;
};

export type AdminAuditDetail = AdminAuditListItem & {
  metadata: SafeAuditMetadata;
  // Resolved display label for the actor (name or public slug) — never email.
  actorLabel: string | null;
};

export type AuditFilters = {
  action?: string;
  family?: AuditActionFamily;
  targetType?: string;
  targetId?: string;
  actorUserId?: string;
  correlationId?: string;
  from?: Date;
  to?: Date;
};

export type ListAuditParams = AuditFilters & { limit: number; cursor?: Cursor };

export type ListAuditResult =
  | { ok: true; page: CursorPage<AdminAuditListItem> }
  | { ok: false; failure: AuthzFailure };

export type AuditDetailResult =
  | { ok: true; entry: AdminAuditDetail }
  | { ok: false; failure: AuthzFailure }
  | { ok: false; error: "NOT_FOUND" };

const listSelect = {
  id: true,
  createdAt: true,
  action: true,
  outcome: true,
  actorUserId: true,
  targetType: true,
  targetId: true,
  correlationId: true,
  metadata: true,
} satisfies Prisma.AuditLogSelect;

type Row = Prisma.AuditLogGetPayload<{ select: typeof listSelect }>;

function toListItem(row: Row): AdminAuditListItem {
  const safe = sanitizeAuditMetadata(row.metadata);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    family: auditActionFamily(row.action),
    outcome: row.outcome,
    actorUserId: row.actorUserId,
    targetType: row.targetType,
    targetId: row.targetId,
    correlationId: row.correlationId,
    summary: safeAuditSummary(row.action, safe),
  };
}

function buildWhere(params: AuditFilters & { cursor?: Cursor }): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (params.from) createdAt.gte = params.from;
  if (params.to) createdAt.lte = params.to;

  // Exact action takes precedence; otherwise a family is a prefix match.
  const actionWhere: Prisma.AuditLogWhereInput = params.action
    ? { action: params.action }
    : params.family && params.family !== "other"
      ? { action: { startsWith: `${params.family}.` } }
      : {};

  return {
    ...actionWhere,
    ...(params.targetType ? { targetType: params.targetType } : {}),
    ...(params.targetId ? { targetId: params.targetId } : {}),
    ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
    ...(params.correlationId ? { correlationId: params.correlationId } : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(params.cursor ? keysetWhere("createdAt", params.cursor, "desc") : {}),
  };
}

/**
 * SUPER_ADMIN-only, read-only audit list. Newest-first keyset order
 * (createdAt DESC, id DESC). Enforces `admin.audit.read` itself.
 */
export async function listAuditLogs(params: ListAuditParams): Promise<ListAuditResult> {
  const authz = await requirePermission("admin.audit.read");
  if (!authz.ok) return { ok: false, failure: authz };

  const rows = await prisma.auditLog.findMany({
    where: buildWhere(params),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    select: listSelect,
  });

  const page = buildCursorPage(rows.map(toListItem), params.limit, (item) => ({
    v: item.createdAt,
    id: item.id,
  }));
  return { ok: true, page };
}

export async function getAuditLogDetail(auditId: string): Promise<AuditDetailResult> {
  const authz = await requirePermission("admin.audit.read");
  if (!authz.ok) return { ok: false, failure: authz };
  if (!UUID_RE.test(auditId)) return { ok: false, error: "NOT_FOUND" };

  const row = await prisma.auditLog.findUnique({ where: { id: auditId }, select: listSelect });
  if (!row) return { ok: false, error: "NOT_FOUND" };

  let actorLabel: string | null = null;
  if (row.actorUserId) {
    const actor = await prisma.user.findUnique({
      where: { id: row.actorUserId },
      select: { name: true, publicSlug: true },
    });
    if (actor) {
      const trimmed = actor.name?.trim();
      actorLabel = trimmed && trimmed.length > 0 ? trimmed : `User ${actor.publicSlug.toString()}`;
    }
  }

  return {
    ok: true,
    entry: { ...toListItem(row), metadata: sanitizeAuditMetadata(row.metadata), actorLabel },
  };
}
