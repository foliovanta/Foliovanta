import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  accessErrorResponse,
  internalErrorResponse,
  invalidIdResponse,
  jsonError,
  noStoreHeaders,
  notFoundResponse,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/lib/portfolios/http-responses";
import { rollbackPortfolio } from "@/lib/publishing/publish-service";

export const runtime = "nodejs";

const rollbackSchema = z.strictObject({
  versionNumber: z.number().int().positive(),
  // The active version the client believed was live — optimistic concurrency.
  expectedActiveVersionNumber: z.number().int().positive(),
});

export async function POST(request: Request, context: { params: Promise<{ portfolioId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return unauthenticatedResponse();
  }

  const { portfolioId } = await context.params;
  if (!z.uuid().safeParse(portfolioId).success) {
    return invalidIdResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");
  }

  const parsed = rollbackSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await rollbackPortfolio(
      userId,
      portfolioId,
      parsed.data.versionNumber,
      parsed.data.expectedActiveVersionNumber,
    );

    if (!result.ok) {
      switch (result.error) {
        case "USER_NOT_SYNCED":
        case "ACCOUNT_SUSPENDED":
        case "ACCOUNT_UNAVAILABLE":
          return accessErrorResponse(result.error);
        case "NOT_FOUND":
        case "TARGET_NOT_FOUND":
          return notFoundResponse();
        case "NOT_PUBLISHED":
          return jsonError(409, "NOT_PUBLISHED", "Publish the portfolio before rolling back");
        case "TARGET_UNRENDERABLE":
          return jsonError(
            422,
            "TARGET_UNRENDERABLE",
            "That version can no longer be rendered and can't be made live",
          );
        case "ROLLBACK_CONFLICT":
          return jsonError(409, "ROLLBACK_CONFLICT", "The live version changed — reload and retry");
        case "PORTFOLIO_SUSPENDED":
          return jsonError(403, "PORTFOLIO_SUSPENDED", "This portfolio is suspended");
      }
    }

    return NextResponse.json(
      {
        data: {
          activeVersionNumber: result.activeVersionNumber,
          publicationStatus: result.publicationStatus,
          publishedAt: result.publishedAt.toISOString(),
          changed: result.changed,
        },
      },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to roll back portfolio", error);
    return internalErrorResponse();
  }
}
