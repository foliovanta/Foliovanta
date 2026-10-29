import { NextResponse } from "next/server";

import { adminErrorResponse, adminJson, correlationId, noStoreHeaders } from "@/lib/admin/http";
import { getAdminOverview } from "@/lib/admin/overview";
import { requirePermission } from "@/lib/auth/authorization";
import { recordAuthorizationFailure } from "@/lib/audit/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cid = correlationId(request);

  const authz = await requirePermission("admin.overview.read");
  if (!authz.ok) {
    // Audit every authenticated denial (not anonymous noise) as a security event.
    if (authz.reason !== "UNAUTHENTICATED") {
      await recordAuthorizationFailure({
        action: "admin.overview.read.denied",
        actorUserId: authz.actorUserId ?? null,
        correlationId: cid,
        metadata: { reason: authz.reason },
      });
    }
    return adminErrorResponse(authz, cid);
  }

  try {
    const overview = await getAdminOverview();
    return adminJson(overview, cid);
  } catch (error) {
    console.error("Failed to load admin overview", { correlationId: cid, error });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unable to load the overview" } },
      { status: 500, headers: { ...noStoreHeaders, "x-correlation-id": cid } },
    );
  }
}
