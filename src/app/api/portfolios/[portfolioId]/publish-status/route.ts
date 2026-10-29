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
import { getPublishStatus } from "@/lib/publishing/publish-status";

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
    const result = await getPublishStatus(userId, portfolioId);
    if (!result.ok) {
      return result.error === "NOT_FOUND" ? notFoundResponse() : accessErrorResponse(result.error);
    }

    const { status } = result;
    return NextResponse.json(
      {
        data: {
          slug: status.slug,
          publicSlug: status.publicSlug,
          username: status.username,
          templateKey: status.templateKey,
          publicationStatus: status.publicationStatus,
          moderationStatus: status.moderationStatus,
          revision: status.revision.toString(),
          publishedAt: status.publishedAt?.toISOString() ?? null,
          hasUnpublishedChanges: status.hasUnpublishedChanges,
          readiness: status.readiness,
          activeVersion: status.activeVersion
            ? {
                versionNumber: status.activeVersion.versionNumber,
                publishedAt: status.activeVersion.publishedAt.toISOString(),
                templateId: status.activeVersion.templateId,
                templateVersion: status.activeVersion.templateVersion,
              }
            : null,
        },
      },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load publish status", error);
    return internalErrorResponse();
  }
}
