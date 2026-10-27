import { NextResponse } from "next/server";

import {
  internalErrorResponse,
  noStoreHeaders,
  notFoundResponse,
} from "@/lib/portfolios/http-responses";
import { getPublicPortfolio } from "@/lib/publishing/public-read";

export const runtime = "nodejs";

// Public, unauthenticated read of the active published snapshot. No Clerk auth;
// the proxy does not protect /api/public. Responses are no-store (see caching
// notes in the Step-3 report) so suspended/unpublished portfolios are never
// served from a stale cache.
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;

  try {
    const result = await getPublicPortfolio(slug);
    if (!result.ok) {
      return notFoundResponse();
    }

    return NextResponse.json(
      { data: { snapshot: result.snapshot, versionNumber: result.versionNumber } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to read public portfolio", error);
    return internalErrorResponse();
  }
}
