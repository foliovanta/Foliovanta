import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { type CreatePortfolioError, createPortfolio } from "@/lib/portfolios/create-portfolio";
import { listPortfolios } from "@/lib/portfolios/get-portfolios";
import {
  accessErrorResponse,
  internalErrorResponse,
  unauthenticatedResponse,
} from "@/lib/portfolios/http-responses";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return unauthenticatedResponse();
  }

  try {
    const result = await listPortfolios(userId);

    if (!result.ok) {
      return accessErrorResponse(result.error);
    }

    return NextResponse.json({ data: result.portfolios }, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    console.error("Failed to list portfolios", error);

    return internalErrorResponse();
  }
}

const createPortfolioSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
});

const errorStatus: Record<CreatePortfolioError, number> = {
  USER_NOT_SYNCED: 404,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_UNAVAILABLE: 403,
  PORTFOLIO_LIMIT_REACHED: 409,
};

const errorMessage: Record<CreatePortfolioError, string> = {
  USER_NOT_SYNCED: "User account is being synchronized",
  ACCOUNT_SUSPENDED: "Your account is suspended",
  ACCOUNT_UNAVAILABLE: "Your account is unavailable",
  PORTFOLIO_LIMIT_REACHED: "You already have a portfolio",
};

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
      { status: 401, headers: noStoreHeaders },
    );
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

  const parsed = createPortfolioSchema.safeParse(body);

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
    const result = await createPortfolio({
      clerkUserId: userId,
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: { code: result.error, message: errorMessage[result.error] },
        },
        { status: errorStatus[result.error], headers: noStoreHeaders },
      );
    }

    return NextResponse.json({ data: result.portfolio }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    console.error("Failed to create portfolio", error);

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unable to create portfolio" } },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
