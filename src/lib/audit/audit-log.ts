import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AuditOutcome } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";

export type { AuditOutcome };

// Accepts the shared client or a transaction client, so an audit write can be
// made part of the same transaction as a critical mutation (atomic: either both
// the change and its audit record commit, or neither does).
type Db = Pick<typeof prisma, "auditLog"> | Prisma.TransactionClient;

export type AuditInput = {
  // Stable dotted identifier, e.g. "admin.role.granted", "admin.access.denied".
  action: string;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  outcome?: AuditOutcome;
  correlationId?: string | null;
  // Safe, structured, non-sensitive context only.
  metadata?: Record<string, unknown> | null;
};

// Keys we refuse to persist even if a caller passes them — defense in depth so a
// careless caller can't leak secrets into durable audit metadata. Credentials,
// tokens, session data and raw bodies must never be audited.
const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|credential|bearer/i;

const MAX_STRING = 2_000;

/**
 * Shallow-sanitize caller metadata: redact sensitive-looking keys and cap long
 * strings. Returns undefined for empty input so the column stays NULL.
 */
export function sanitizeMetadata(
  meta: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!meta) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEY.test(key)) {
      clean[key] = "[redacted]";
      continue;
    }
    clean[key] = typeof value === "string" && value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…`
      : value;
  }
  return clean as Prisma.InputJsonValue;
}

/**
 * Insert one durable audit record. Append-only — there is no update/delete path
 * in the app, and the database enforces it with a trigger. Pass `db` (a tx
 * client) to couple the audit write to a critical mutation.
 */
export async function recordAudit(input: AuditInput, db: Db = prisma): Promise<void> {
  const metadata = sanitizeMetadata(input.metadata);
  await db.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      outcome: input.outcome ?? "SUCCESS",
      correlationId: input.correlationId ?? null,
      ...(metadata !== undefined ? { metadata } : {}),
    },
  });
}

/**
 * Security log for a denied/failed authorization attempt. Written OUTSIDE any
 * mutation transaction (there is none to protect) and swallows its own errors —
 * failing to persist a security event must never turn a clean 401/403 into a
 * 500, nor block the response.
 */
export async function recordAuthorizationFailure(
  input: Omit<AuditInput, "outcome">,
): Promise<void> {
  try {
    await recordAudit({ ...input, outcome: "DENIED" });
  } catch (error) {
    console.error("Failed to write authorization-failure audit", {
      action: input.action,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
