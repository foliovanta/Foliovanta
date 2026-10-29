import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  adminError,
  adminJson,
  adminValidationError,
  correlationId,
  rateLimitBlockedResponse,
  serviceUnavailableResponse,
} from "@/lib/admin/http";
import { enforceRateLimit } from "@/lib/admin/rate-limit";
import { isStrictSecurity } from "@/lib/env/security";
import { prisma } from "@/lib/db/prisma";
import { REPORT_DETAILS_MAX, submitReport } from "@/lib/reports/service";
import { anonymousNetworkKey, verifyTurnstile } from "@/lib/trust/anti-spam";

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  publicSlug: z.string().regex(/^[1-9][0-9]{0,18}$/),
  reason: z.enum(["HARASSMENT", "IMPERSONATION", "SPAM", "INAPPROPRIATE", "IP_CONCERN", "OTHER"]),
  details: z.string().trim().max(REPORT_DETAILS_MAX).optional(),
  turnstileToken: z.string().max(4000).optional(),
});

// Neutral acknowledgment — identical whether or not a report was created, so the
// response never reveals target existence/eligibility or any enforcement.
const neutralAck = (cid: string) => adminJson({ received: true }, cid);

export async function POST(request: Request) {
  const cid = correlationId(request);
  const { userId: clerkUserId } = await auth();

  // Anonymous callers are bucketed by a hashed network id (never a raw IP);
  // authenticated callers by their id. Reports fail-closed on limiter outage.
  const identity = clerkUserId ? `report:user:${clerkUserId}` : `report:${anonymousNetworkKey(request)}`;
  const decision = await enforceRateLimit(identity, "report");
  if (!decision.allowed) return rateLimitBlockedResponse(decision, cid);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return adminValidationError(cid, "Request body must be valid JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return adminValidationError(cid, "Invalid report");

  // Anonymous submissions require a Turnstile challenge. Authenticated users are
  // exempt (policy decision, documented in the M6.5.2 ADR). Server-side only.
  if (!clerkUserId) {
    const turnstile = await verifyTurnstile(parsed.data.turnstileToken, undefined);
    // STRICT mode: Turnstile MUST be configured and pass — an unconfigured
    // provider is a misconfiguration that fails closed (503), never a silent
    // bypass. RELAXED mode (dev): an unconfigured provider is allowed.
    if (!turnstile.configured) {
      if (isStrictSecurity()) {
        console.warn("Turnstile required but not configured (strict mode)", { correlationId: cid });
        return serviceUnavailableResponse(cid);
      }
    } else if (!turnstile.ok) {
      if (turnstile.errorCodes && turnstile.errorCodes.length > 0) {
        console.warn("Turnstile verification failed", { correlationId: cid, errorCodes: turnstile.errorCodes });
      }
      return adminError(cid, 422, "VERIFICATION_FAILED", "Please complete the verification and retry");
    }
  }

  // Attribute to an ACTIVE account when authenticated; otherwise anonymous.
  let reporterUserId: string | null = null;
  if (clerkUserId) {
    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, status: true },
    });
    if (user && user.status === "ACTIVE") reporterUserId = user.id;
  }

  await submitReport({
    publicSlug: parsed.data.publicSlug,
    reason: parsed.data.reason,
    reporterUserId,
    ...(parsed.data.details ? { details: parsed.data.details } : {}),
  });

  return neutralAck(cid);
}
