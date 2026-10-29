import { auth } from "@clerk/nextjs/server";

import {
  adminErrorResponse,
  adminJson,
  adminNotFoundResponse,
  correlationId,
  rateLimitBlockedResponse,
  rateLimitIdentity,
} from "@/lib/admin/http";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { auditDenied } from "@/lib/admin/route-helpers";
import { getAdminUserDetail } from "@/lib/admin/users-directory";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const cid = correlationId(request);

  const { userId: clerkUserId } = await auth();
  const decision = await enforceRateLimit(rateLimitIdentity(request, clerkUserId), "read");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  const { userId } = await context.params;
  const result = await getAdminUserDetail(userId);
  if (!result.ok) {
    if ("failure" in result) {
      await auditDenied("admin.users.read.denied", result.failure, cid);
      return adminErrorResponse(result.failure, cid);
    }
    return adminNotFoundResponse(cid);
  }
  return adminJson(result.user, cid);
}
