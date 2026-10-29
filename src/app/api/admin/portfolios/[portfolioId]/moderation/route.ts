import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  adminError,
  adminErrorResponse,
  adminJson,
  adminValidationError,
  correlationId,
  rateLimitBlockedResponse,
  rateLimitIdentity,
} from "@/lib/admin/http";
import { type PortfolioModerationInput, moderatePortfolio } from "@/lib/admin/moderation";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { auditDenied } from "@/lib/admin/route-helpers";

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  action: z.enum(["SUSPEND", "REINSTATE", "MARK_UNDER_REVIEW", "CLEAR_REVIEW"]),
  reason: z.string().trim().max(1000).optional(),
  expectedModerationStatus: z.enum(["CLEAR", "UNDER_REVIEW", "SUSPENDED"]).optional(),
  idempotencyKey: z.string().min(8).max(200),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ portfolioId: string }> },
) {
  const cid = correlationId(request);

  const { userId: clerkUserId } = await auth();
  // Privileged mutation → strict, fail-closed rate limiting.
  const decision = await enforceRateLimit(rateLimitIdentity(request, clerkUserId), "mutation");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  const { portfolioId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return adminValidationError(cid, "Request body must be valid JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return adminValidationError(cid, "Invalid moderation request");

  const input: PortfolioModerationInput = {
    action: parsed.data.action,
    idempotencyKey: parsed.data.idempotencyKey,
    correlationId: cid,
    ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
    ...(parsed.data.expectedModerationStatus !== undefined
      ? { expectedModerationStatus: parsed.data.expectedModerationStatus }
      : {}),
  };

  const result = await moderatePortfolio(portfolioId, input);
  if (!result.ok) {
    if ("failure" in result) {
      await auditDenied("moderation.portfolio.denied", result.failure, cid);
      return adminErrorResponse(result.failure, cid);
    }
    switch (result.error) {
      case "NOT_FOUND":
        return adminError(cid, 404, "NOT_FOUND", "Portfolio not found");
      case "REASON_REQUIRED":
        return adminError(cid, 422, "REASON_REQUIRED", "A reason is required for this action");
      case "INVALID_TRANSITION":
        return adminError(cid, 409, "INVALID_TRANSITION", "That transition isn't allowed from the current state");
      case "STATE_CONFLICT":
        return adminError(cid, 409, "STATE_CONFLICT", "The moderation state changed — reload and retry");
      case "IDEMPOTENCY_CONFLICT":
        return adminError(cid, 409, "IDEMPOTENCY_CONFLICT", "This idempotency key was used with a different request");
    }
  }

  return adminJson(result, cid);
}
