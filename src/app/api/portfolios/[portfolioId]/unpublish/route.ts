import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  accessErrorResponse,
  internalErrorResponse,
  invalidIdResponse,
  noStoreHeaders,
  notFoundResponse,
  unauthenticatedResponse,
} from "@/lib/portfolios/http-responses";
import { unpublishPortfolio } from "@/lib/publishing/publish-service";

export const runtime = "nodejs";

export async function POST(
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
    const result = await unpublishPortfolio(userId, portfolioId);

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return notFoundResponse();
      }
      return accessErrorResponse(result.error);
    }

    return NextResponse.json(
      {
        data: {
          publicationStatus: result.publicationStatus,
          revision: result.revision.toString(),
        },
      },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to unpublish portfolio", error);
    return internalErrorResponse();
  }
}
