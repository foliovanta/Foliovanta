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
import { type ListUsersParams, listAdminUsers } from "@/lib/admin/users-directory";

export const runtime = "nodejs";

const querySchema = z.object({
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETION_PENDING"]).optional(),
  q: z.string().trim().min(1).max(200).optional(),
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

  const params: ListUsersParams = {
    limit: parsed.data.limit ?? DEFAULT_PAGE_SIZE,
    ...(parsed.data.role ? { role: parsed.data.role } : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.q ? { q: parsed.data.q } : {}),
    ...(cursor ? { cursor } : {}),
  };

  const result = await listAdminUsers(params);
  if (!result.ok) {
    await auditDenied("admin.users.read.denied", result.failure, cid);
    return adminErrorResponse(result.failure, cid);
  }
  return adminJson(result.page, cid);
}
