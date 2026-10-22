import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  internalErrorResponse,
  invalidIdResponse,
  mutationErrorResponse,
  noStoreHeaders,
  unauthenticatedResponse,
} from "@/lib/portfolios/http-responses";
import { listSections } from "@/lib/portfolios/sections";

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
    return invalidIdResponse();
  }

  try {
    const result = await listSections(userId, portfolioId);
    if (!result.ok) {
      return mutationErrorResponse(result.error);
    }

    return NextResponse.json(
      { data: { sections: result.sections, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to list sections", error);
    return internalErrorResponse();
  }
}
