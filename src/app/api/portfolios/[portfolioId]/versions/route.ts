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
import { listPortfolioVersions } from "@/lib/publishing/version-history";

export const runtime = "nodejs";

const cursorSchema = z.coerce.number().int().positive();
const limitSchema = z.coerce.number().int().min(1).max(50);

export async function GET(
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

  const url = new URL(request.url);
  const cursorParsed = cursorSchema.safeParse(url.searchParams.get("cursor"));
  const limitParsed = limitSchema.safeParse(url.searchParams.get("limit"));

  try {
    const result = await listPortfolioVersions(userId, portfolioId, {
      ...(cursorParsed.success ? { cursor: cursorParsed.data } : {}),
      ...(limitParsed.success ? { limit: limitParsed.data } : {}),
    });
    if (!result.ok) {
      return result.error === "NOT_FOUND" ? notFoundResponse() : accessErrorResponse(result.error);
    }

    return NextResponse.json(
      {
        data: {
          versions: result.versions.map((v) => ({
            versionNumber: v.versionNumber,
            publishedAt: v.publishedAt.toISOString(),
            templateId: v.templateId,
            templateVersion: v.templateVersion,
            isActive: v.isActive,
          })),
          nextCursor: result.nextCursor,
        },
      },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to list portfolio versions", error);
    return internalErrorResponse();
  }
}
