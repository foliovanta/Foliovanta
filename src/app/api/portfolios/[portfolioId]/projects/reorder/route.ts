import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
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
import { reorderProjects, reorderProjectsSchema } from "@/lib/portfolios/projects";

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

  const parsed = reorderProjectsSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await reorderProjects(userId, portfolioId, parsed.data);
    if (!result.ok) {
      return mutationErrorResponse(result.error);
    }

    return NextResponse.json(
      { data: { projects: result.projects, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to reorder projects", error);
    return internalErrorResponse();
  }
}
