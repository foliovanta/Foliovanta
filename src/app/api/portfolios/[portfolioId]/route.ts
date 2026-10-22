import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getPortfolioById } from "@/lib/portfolios/get-portfolios";
import {
  accessErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundResponse,
  unauthenticatedResponse,
} from "@/lib/portfolios/http-responses";

export const runtime = "nodejs";

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
    return NextResponse.json(
      { error: { code: "INVALID_PORTFOLIO_ID", message: "Invalid portfolio id" } },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const result = await getPortfolioById(userId, portfolioId);

    if (!result.ok) {
      return result.error === "NOT_FOUND" ? notFoundResponse() : accessErrorResponse(result.error);
    }

    return NextResponse.json({ data: result.portfolio }, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    console.error("Failed to retrieve portfolio", error);

    return internalErrorResponse();
  }
}
