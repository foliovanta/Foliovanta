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
import { updateTemplate } from "@/lib/portfolios/update-template";

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  templateKey: z.string().min(1).max(32),
  expectedRevision: expectedRevisionSchema,
});

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await updateTemplate(
      userId,
      portfolioId,
      parsed.data.expectedRevision,
      parsed.data.templateKey,
    );

    if (!result.ok) {
      switch (result.error) {
        case "INVALID_TEMPLATE":
          return jsonError(400, "INVALID_TEMPLATE", "The selected template is not supported");
        case "REVISION_CONFLICT":
          return revisionConflictResponse();
        case "NOT_FOUND":
          return notFoundResponse();
        default:
          return accessErrorResponse(result.error);
      }
    }

    return NextResponse.json(
      { data: { templateKey: result.value.templateKey, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to update template", error);
    return internalErrorResponse();
  }
}
