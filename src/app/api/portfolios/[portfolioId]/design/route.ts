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
import { getDesignState, updateDesign } from "@/lib/portfolios/update-design";

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
    const result = await getDesignState(userId, portfolioId);
    if (!result.ok) {
      return result.error === "NOT_FOUND" ? notFoundResponse() : accessErrorResponse(result.error);
    }
    return NextResponse.json(
      {
        data: {
          design: result.state.design,
          templateKey: result.state.templateKey,
          revision: result.state.revision.toString(),
        },
      },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load design", error);
    return internalErrorResponse();
  }
}

const patchSchema = z.object({
  // The design payload is validated in depth by the service's designConfigSchema.
  design: z.unknown(),
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await updateDesign(
      userId,
      portfolioId,
      parsed.data.expectedRevision,
      parsed.data.design,
    );

    if (!result.ok) {
      switch (result.error) {
        case "INVALID_DESIGN":
          return jsonError(400, "INVALID_DESIGN", "The design configuration is not valid");
        case "REVISION_CONFLICT":
          return revisionConflictResponse();
        case "NOT_FOUND":
          return notFoundResponse();
        default:
          return accessErrorResponse(result.error);
      }
    }

    return NextResponse.json(
      { data: { design: result.value.design, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to update design", error);
    return internalErrorResponse();
  }
}
