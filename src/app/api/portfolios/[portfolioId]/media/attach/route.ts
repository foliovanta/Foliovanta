import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { attachMediaAsset } from "@/lib/media/attach-service";
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

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("avatar") }),
    z.strictObject({ kind: z.literal("project"), projectId: z.uuid() }),
  ]),
  // null detaches.
  assetId: z.union([z.uuid(), z.null()]),
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
    const result = await attachMediaAsset(
      userId,
      portfolioId,
      parsed.data.expectedRevision,
      parsed.data.target,
      parsed.data.assetId,
    );

    if (!result.ok) {
      switch (result.error) {
        case "REVISION_CONFLICT":
          return revisionConflictResponse();
        case "NOT_FOUND":
          return notFoundResponse();
        case "INVALID_ASSET":
          return jsonError(400, "INVALID_ASSET", "The asset can't be attached here");
        case "PROJECT_NOT_FOUND":
          return jsonError(404, "PROJECT_NOT_FOUND", "Project not found");
        default:
          return accessErrorResponse(result.error);
      }
    }

    return NextResponse.json(
      { data: { assetId: result.value.assetId, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to attach media asset", error);
    return internalErrorResponse();
  }
}
