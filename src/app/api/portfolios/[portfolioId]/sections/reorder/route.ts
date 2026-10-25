import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  internalErrorResponse,
  invalidIdResponse,
  jsonError,
  mutationErrorResponse,
  noStoreHeaders,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/lib/portfolios/http-responses";
import { reorderSections, reorderSectionsSchema } from "@/lib/portfolios/sections";

export const runtime = "nodejs";

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
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");
  }

  const parsed = reorderSectionsSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await reorderSections(userId, portfolioId, parsed.data);
    if (!result.ok) {
      return mutationErrorResponse(result.error);
    }

    return NextResponse.json(
      { data: { sections: result.sections, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to reorder sections", error);
    return internalErrorResponse();
  }
}
