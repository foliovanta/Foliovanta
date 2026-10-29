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
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, decodeCursor } from "@/lib/admin/pagination";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { auditDenied } from "@/lib/admin/route-helpers";
import { type ListReportsParams, listAdminReports } from "@/lib/reports/service";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "ACTIONED", "DISMISSED"]).optional(),
  reason: z.enum(["HARASSMENT", "IMPERSONATION", "SPAM", "INAPPROPRIATE", "IP_CONCERN", "OTHER"]).optional(),
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

  const params: ListReportsParams = {
    limit: parsed.data.limit ?? DEFAULT_PAGE_SIZE,
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    ...(cursor ? { cursor } : {}),
  };
  const result = await listAdminReports(params);
  if (!result.ok) {
    await auditDenied("admin.reports.read.denied", result.failure, cid);
    return adminErrorResponse(result.failure, cid);
  }
  return adminJson(result.page, cid);
}
