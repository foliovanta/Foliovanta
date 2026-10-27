import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  accessErrorResponse,
  internalErrorResponse,
  invalidIdResponse,
  jsonError,
  noStoreHeaders,
  notFoundResponse,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/lib/portfolios/http-responses";
import { updateUsername } from "@/lib/portfolios/update-username";

export const runtime = "nodejs";

const bodySchema = z.strictObject({ username: z.string().trim().min(1).max(100) });

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
    const result = await updateUsername(userId, portfolioId, parsed.data.username);
    if (!result.ok) {
      switch (result.error) {
        case "NOT_FOUND":
          return notFoundResponse();
        case "INVALID_USERNAME":
          return jsonError(400, "INVALID_USERNAME", "The requested username is not valid");
        default:
          return accessErrorResponse(result.error);
      }
    }

    return NextResponse.json(
      { data: { username: result.username } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to update username", error);
    return internalErrorResponse();
  }
}
