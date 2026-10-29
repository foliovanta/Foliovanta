import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  adminError,
  adminJson,
  adminValidationError,
  correlationId,
  rateLimitBlockedResponse,
} from "@/lib/admin/http";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { FEEDBACK_MESSAGE_MAX, submitFeedback } from "@/lib/feedback/service";

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  category: z.enum(["BUG", "FEATURE_REQUEST", "USABILITY", "OTHER"]),
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX),
  portfolioId: z.uuid().optional(),
});

export async function POST(request: Request) {
  const cid = correlationId(request);

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return adminError(cid, 401, "UNAUTHENTICATED", "Sign in to send feedback");
  }

  // Authenticated write → fail-closed rate limiting, keyed by the user.
  const decision = await enforceRateLimit(`feedback:user:${clerkUserId}`, "feedback");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return adminValidationError(cid, "Request body must be valid JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return adminValidationError(cid, "Invalid feedback");

  const result = await submitFeedback(clerkUserId, {
    category: parsed.data.category,
    message: parsed.data.message,
    ...(parsed.data.portfolioId ? { portfolioId: parsed.data.portfolioId } : {}),
  });

  if (!result.ok) {
    switch (result.error) {
      case "USER_NOT_SYNCED":
        return adminError(cid, 404, "USER_NOT_SYNCED", "Your account is still being set up");
      case "ACCOUNT_SUSPENDED":
      case "ACCOUNT_UNAVAILABLE":
        return adminError(cid, 403, result.error, "Your account can't send feedback");
      case "PORTFOLIO_NOT_OWNED":
        return adminError(cid, 403, "PORTFOLIO_NOT_OWNED", "You can only reference your own portfolio");
    }
  }

  // No internal id returned.
  return adminJson({ received: true }, cid);
}
