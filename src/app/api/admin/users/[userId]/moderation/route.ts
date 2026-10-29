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
import { type AccountModerationInput, moderateAccount } from "@/lib/admin/moderation";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { auditDenied } from "@/lib/admin/route-helpers";

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  action: z.enum(["SUSPEND", "REINSTATE"]),
  reason: z.string().trim().max(1000).optional(),
  expectedStatus: z.enum(["ACTIVE", "SUSPENDED", "DELETION_PENDING"]).optional(),
  idempotencyKey: z.string().min(8).max(200),
});

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const cid = correlationId(request);

  const { userId: clerkUserId } = await auth();
  const decision = await enforceRateLimit(rateLimitIdentity(request, clerkUserId), "mutation");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  const { userId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return adminValidationError(cid, "Request body must be valid JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return adminValidationError(cid, "Invalid moderation request");

  const input: AccountModerationInput = {
    action: parsed.data.action,
    idempotencyKey: parsed.data.idempotencyKey,
    correlationId: cid,
    ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
    ...(parsed.data.expectedStatus !== undefined ? { expectedStatus: parsed.data.expectedStatus } : {}),
  };

  const result = await moderateAccount(userId, input);
  if (!result.ok) {
    if ("failure" in result) {
      await auditDenied("moderation.account.denied", result.failure, cid);
      return adminErrorResponse(result.failure, cid);
    }
    switch (result.error) {
      case "NOT_FOUND":
        return adminError(cid, 404, "NOT_FOUND", "User not found");
      case "SELF_TARGET":
        return adminError(cid, 403, "SELF_TARGET", "You cannot restrict your own account");
      case "ADMIN_TARGET":
        return adminError(cid, 403, "ADMIN_TARGET", "Administrator accounts cannot be restricted here");
      case "REASON_REQUIRED":
        return adminError(cid, 422, "REASON_REQUIRED", "A reason is required for this action");
      case "INVALID_TRANSITION":
        return adminError(cid, 409, "INVALID_TRANSITION", "That transition isn't allowed from the current state");
      case "STATE_CONFLICT":
        return adminError(cid, 409, "STATE_CONFLICT", "The account state changed — reload and retry");
      case "IDEMPOTENCY_CONFLICT":
        return adminError(cid, 409, "IDEMPOTENCY_CONFLICT", "This idempotency key was used with a different request");
    }
  }

  return adminJson(result, cid);
}
