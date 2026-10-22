import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getPortfolioProfile,
  updatePortfolioProfile,
  updatePortfolioProfileSchema,
} from "@/lib/portfolios/profile";
import {
  accessErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundResponse,
  revisionConflictResponse,
  unauthenticatedResponse,
} from "@/lib/portfolios/http-responses";

export const runtime = "nodejs";

function invalidIdResponse() {
  return NextResponse.json(
    { error: { code: "INVALID_PORTFOLIO_ID", message: "Invalid portfolio id" } },
    { status: 400, headers: noStoreHeaders },
  );
}

export async function GET(
  _request: Request,
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

  try {
    const result = await getPortfolioProfile(userId, portfolioId);

    if (!result.ok) {
      return result.error === "NOT_FOUND" ? notFoundResponse() : accessErrorResponse(result.error);
    }

    return NextResponse.json(
      { data: { profile: result.profile, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to retrieve portfolio profile", error);

    return internalErrorResponse();
  }
}

export async function PATCH(
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
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be valid JSON" } },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const parsed = updatePortfolioProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: z.flattenError(parsed.error).fieldErrors,
        },
      },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const result = await updatePortfolioProfile(userId, portfolioId, parsed.data);

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return notFoundResponse();
      }
      if (result.error === "REVISION_CONFLICT") {
        return revisionConflictResponse();
      }
      return accessErrorResponse(result.error);
    }

    return NextResponse.json(
      { data: { profile: result.profile, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to update portfolio profile", error);

    return internalErrorResponse();
  }
}
