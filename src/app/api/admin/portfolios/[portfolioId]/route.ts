import { auth } from "@clerk/nextjs/server";

import {
  adminErrorResponse,
  adminJson,
  adminNotFoundResponse,
  correlationId,
  rateLimitBlockedResponse,
  rateLimitIdentity,
} from "@/lib/admin/http";
import { getAdminPortfolioDetail } from "@/lib/admin/portfolios-directory";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { auditDenied } from "@/lib/admin/route-helpers";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ portfolioId: string }> },
) {
  const cid = correlationId(request);

  const { userId: clerkUserId } = await auth();
  const decision = await enforceRateLimit(rateLimitIdentity(request, clerkUserId), "read");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  const { portfolioId } = await context.params;
  const result = await getAdminPortfolioDetail(portfolioId);
  if (!result.ok) {
    if ("failure" in result) {
      await auditDenied("admin.portfolios.read.denied", result.failure, cid);
      return adminErrorResponse(result.failure, cid);
    }
    return adminNotFoundResponse(cid);
  }
  return adminJson(result.portfolio, cid);
}
