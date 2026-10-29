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
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { auditDenied } from "@/lib/admin/route-helpers";
import { type FeedbackTriageInput, triageFeedback } from "@/lib/feedback/service";

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  action: z.enum(["REVIEW", "RESOLVE", "CLOSE"]),
  expectedStatus: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]).optional(),
  resolutionNote: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().min(8).max(200),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const cid = correlationId(request);
  const { userId: clerkUserId } = await auth();
  const decision = await enforceRateLimit(rateLimitIdentity(request, clerkUserId), "mutation");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return adminValidationError(cid, "Request body must be valid JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return adminValidationError(cid, "Invalid triage request");

  const input: FeedbackTriageInput = {
    action: parsed.data.action,
    idempotencyKey: parsed.data.idempotencyKey,
    correlationId: cid,
    ...(parsed.data.expectedStatus ? { expectedStatus: parsed.data.expectedStatus } : {}),
    ...(parsed.data.resolutionNote ? { resolutionNote: parsed.data.resolutionNote } : {}),
  };
  const result = await triageFeedback(id, input);
  if (!result.ok) {
    if ("failure" in result) {
      await auditDenied("admin.feedback.triage.denied", result.failure, cid);
      return adminErrorResponse(result.failure, cid);
    }
    if (result.error === "NOT_FOUND") return adminError(cid, 404, "NOT_FOUND", "Feedback not found");
    return adminError(cid, 409, result.error, "That triage change isn't allowed right now");
  }
  return adminJson(result, cid);
}
