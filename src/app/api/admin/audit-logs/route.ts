import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  adminErrorResponse,
  adminJson,
  adminValidationError,
  correlationId,
  rateLimitBlockedResponse,
  rateLimitIdentity,
} from "@/lib/admin/http";
import { type ListAuditParams, listAuditLogs } from "@/lib/admin/audit-explorer";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, decodeCursor } from "@/lib/admin/pagination";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { auditDenied } from "@/lib/admin/route-helpers";

export const runtime = "nodejs";

const querySchema = z.object({
  action: z.string().min(1).max(100).optional(),
  family: z.enum(["moderation", "feedback", "report", "admin", "other"]).optional(),
  targetType: z.string().min(1).max(64).optional(),
  targetId: z.string().min(1).max(128).optional(),
  actorUserId: z.uuid().optional(),
  correlationId: z.string().min(1).max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

export async function GET(request: Request) {
  const cid = correlationId(request);
  const { userId: clerkUserId } = await auth();
  const decision = await enforceRateLimit(rateLimitIdentity(request, clerkUserId), "read");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return adminValidationError(cid, "Invalid query parameters");

  let cursor;
  if (parsed.data.cursor) {
    const decoded = decodeCursor(parsed.data.cursor);
    if (!decoded) return adminValidationError(cid, "Invalid or expired cursor");
    cursor = decoded;
  }

  const params: ListAuditParams = {
    limit: parsed.data.limit ?? DEFAULT_PAGE_SIZE,
    ...(parsed.data.action ? { action: parsed.data.action } : {}),
    ...(parsed.data.family ? { family: parsed.data.family } : {}),
    ...(parsed.data.targetType ? { targetType: parsed.data.targetType } : {}),
    ...(parsed.data.targetId ? { targetId: parsed.data.targetId } : {}),
    ...(parsed.data.actorUserId ? { actorUserId: parsed.data.actorUserId } : {}),
    ...(parsed.data.correlationId ? { correlationId: parsed.data.correlationId } : {}),
    ...(parsed.data.from ? { from: parsed.data.from } : {}),
    ...(parsed.data.to ? { to: parsed.data.to } : {}),
    ...(cursor ? { cursor } : {}),
  };

  const result = await listAuditLogs(params);
  if (!result.ok) {
    await auditDenied("admin.audit.read.denied", result.failure, cid);
    return adminErrorResponse(result.failure, cid);
  }
  return adminJson(result.page, cid);
}
