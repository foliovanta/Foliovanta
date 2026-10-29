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
import { type ReportTriageInput, triageReport } from "@/lib/reports/service";

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  action: z.enum(["REVIEW", "DISMISS", "ACTION"]),
  expectedStatus: z.enum(["OPEN", "IN_REVIEW", "ACTIONED", "DISMISSED"]).optional(),
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

  const input: ReportTriageInput = {
    action: parsed.data.action,
    idempotencyKey: parsed.data.idempotencyKey,
    correlationId: cid,
    ...(parsed.data.expectedStatus ? { expectedStatus: parsed.data.expectedStatus } : {}),
    ...(parsed.data.resolutionNote ? { resolutionNote: parsed.data.resolutionNote } : {}),
  };
  const result = await triageReport(id, input);
  if (!result.ok) {
    if ("failure" in result) {
      await auditDenied("admin.reports.triage.denied", result.failure, cid);
      return adminErrorResponse(result.failure, cid);
    }
    if (result.error === "NOT_FOUND") return adminError(cid, 404, "NOT_FOUND", "Report not found");
    if (result.error === "ENFORCEMENT_REQUIRED") {
      return adminError(
        cid,
        409,
        "ENFORCEMENT_REQUIRED",
        "Suspend the portfolio first (Moderation), then mark the report actioned",
      );
    }
    return adminError(cid, 409, result.error, "That triage change isn't allowed right now");
  }
  return adminJson(result, cid);
}
