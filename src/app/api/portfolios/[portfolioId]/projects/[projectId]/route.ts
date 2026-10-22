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
import {
  deleteProject,
  deleteProjectSchema,
  updateProject,
  updateProjectSchema,
} from "@/lib/portfolios/projects";

export const runtime = "nodejs";

type Context = { params: Promise<{ portfolioId: string; projectId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return unauthenticatedResponse();
  }

  const { portfolioId, projectId } = await context.params;
  if (!z.uuid().safeParse(portfolioId).success || !z.uuid().safeParse(projectId).success) {
    return invalidIdResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await updateProject(userId, portfolioId, projectId, parsed.data);
    if (!result.ok) {
      return mutationErrorResponse(result.error);
    }

    return NextResponse.json(
      { data: { project: result.project, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to update project", error);
    return internalErrorResponse();
  }
}

export async function DELETE(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return unauthenticatedResponse();
  }

  const { portfolioId, projectId } = await context.params;
  if (!z.uuid().safeParse(portfolioId).success || !z.uuid().safeParse(projectId).success) {
    return invalidIdResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");
  }

  const parsed = deleteProjectSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);
  }

  try {
    const result = await deleteProject(
      userId,
      portfolioId,
      projectId,
      parsed.data.expectedRevision,
    );
    if (!result.ok) {
      return mutationErrorResponse(result.error);
    }

    return NextResponse.json(
      { data: { deletedId: result.deletedId, revision: result.revision.toString() } },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to delete project", error);
    return internalErrorResponse();
  }
}
