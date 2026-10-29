import "server-only";

import type { AuthzFailure } from "@/lib/auth/authorization";
import { recordAuthorizationFailure } from "@/lib/audit/audit-log";

/**
 * Audit an authenticated authorization denial as a security event. Anonymous
 * (unauthenticated) attempts are not audited — they're noise and carry no actor.
 */
export async function auditDenied(
  action: string,
  failure: AuthzFailure,
  correlationId: string,
): Promise<void> {
  if (failure.reason === "UNAUTHENTICATED") return;
  await recordAuthorizationFailure({
    action,
    actorUserId: failure.actorUserId ?? null,
    correlationId,
    metadata: { reason: failure.reason },
  });
}
