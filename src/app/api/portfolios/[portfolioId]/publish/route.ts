import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { expectedRevisionSchema } from "@/lib/portfolios/draft-mutation";
import {
  accessErrorResponse,
  internalErrorResponse,
  invalidIdResponse,
  jsonError,
  noStoreHeaders,
  notFoundResponse,
  revisionConflictResponse,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/lib/portfolios/http-responses";
import { publishPortfolio } from "@/lib/publishing/publish-service";

export const runtime = "nodejs";

const publishSchema = z.strictObject({ expectedRevision: expectedRevisionSchema });

export async function POST(
  request: Request,
  context: { params: Promise<{ portfolioId: string }> },
) {
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

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await publishPortfolio(userId, portfolioId, parsed.data.expectedRevision);

    if (!result.ok) {
      switch (result.error) {
        case "USER_NOT_SYNCED":
        case "ACCOUNT_SUSPENDED":
        case "ACCOUNT_UNAVAILABLE":
          return accessErrorResponse(result.error);
        case "NOT_FOUND":
          return notFoundResponse();
        case "REVISION_CONFLICT":
          return revisionConflictResponse();
        case "PUBLISH_CONFLICT":
          return jsonError(409, "PUBLISH_CONFLICT", "A concurrent publish is in progress");
        case "PORTFOLIO_SUSPENDED":
          return jsonError(403, "PORTFOLIO_SUSPENDED", "This portfolio is suspended");
        case "NOT_READY":
          return NextResponse.json(
            {
              error: {
                code: "NOT_READY",
                message: "The portfolio is not ready to publish",
                details: result.issues,
              },
            },
            { status: 422, headers: noStoreHeaders },
          );
      }
    }

    return NextResponse.json(
      {
        data: {
          versionNumber: result.versionNumber,
          publicationStatus: result.publicationStatus,
          publishedAt: result.publishedAt.toISOString(),
          revision: result.revision.toString(),
          contentHash: result.contentHash,
          created: result.created,
        },
      },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to publish portfolio", error);
    return internalErrorResponse();
  }
}
