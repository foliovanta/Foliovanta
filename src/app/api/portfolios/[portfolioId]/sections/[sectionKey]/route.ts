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
import { sectionKeySchema, updateSection, updateSectionSchema } from "@/lib/portfolios/sections";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ portfolioId: string; sectionKey: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return unauthenticatedResponse();
  }

  const { portfolioId, sectionKey } = await context.params;
  if (!z.uuid().safeParse(portfolioId).success) {
    return invalidIdResponse();
  }

  const keyParsed = sectionKeySchema.safeParse(sectionKey);
  if (!keyParsed.success) {
    return mutationErrorResponse("INVALID_SECTION_KEY");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");
  }

  const parsed = updateSectionSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await updateSection(userId, portfolioId, keyParsed.data, parsed.data);
    if (!result.ok) {
      return mutationErrorResponse(result.error);
    }

    return NextResponse.json(
      { data: { section: result.section, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to update section", error);
    return internalErrorResponse();
  }
}
