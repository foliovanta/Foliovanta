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
import { type ListPortfoliosParams, listAdminPortfolios } from "@/lib/admin/portfolios-directory";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { auditDenied } from "@/lib/admin/route-helpers";

export const runtime = "nodejs";

const querySchema = z.object({
  publicationStatus: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED"]).optional(),
  moderationStatus: z.enum(["CLEAR", "UNDER_REVIEW", "SUSPENDED"]).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(["createdAt", "updatedAt"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

export async function GET(request: Request) {
  const cid = correlationId(request);

  const { userId: clerkUserId } = await auth();
  const decision = await enforceRateLimit(rateLimitIdentity(request, clerkUserId), "read");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return adminValidationError(cid, "Invalid query parameters");

  let cursor;
  if (parsed.data.cursor) {
    const decoded = decodeCursor(parsed.data.cursor);
    if (!decoded) return adminValidationError(cid, "Invalid or expired cursor");
    cursor = decoded;
  }

  const params: ListPortfoliosParams = {
    limit: parsed.data.limit ?? DEFAULT_PAGE_SIZE,
    sort: parsed.data.sort ?? "createdAt",
    ...(parsed.data.publicationStatus ? { publicationStatus: parsed.data.publicationStatus } : {}),
    ...(parsed.data.moderationStatus ? { moderationStatus: parsed.data.moderationStatus } : {}),
    ...(parsed.data.q ? { q: parsed.data.q } : {}),
    ...(cursor ? { cursor } : {}),
  };

  const result = await listAdminPortfolios(params);
  if (!result.ok) {
    await auditDenied("admin.portfolios.read.denied", result.failure, cid);
    return adminErrorResponse(result.failure, cid);
  }
  return adminJson(result.page, cid);
}
