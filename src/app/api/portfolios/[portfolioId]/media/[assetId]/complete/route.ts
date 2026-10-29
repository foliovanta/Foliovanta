import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { StorageNotConfiguredError } from "@/lib/media/storage";
import { completeUpload } from "@/lib/media/upload-service";
import {
  accessErrorResponse,
  internalErrorResponse,
  invalidIdResponse,
  jsonError,
  noStoreHeaders,
  notFoundResponse,
  unauthenticatedResponse,
} from "@/lib/portfolios/http-responses";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ portfolioId: string; assetId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return unauthenticatedResponse();
  }

  const { portfolioId, assetId } = await context.params;
  if (!z.uuid().safeParse(portfolioId).success || !z.uuid().safeParse(assetId).success) {
    return invalidIdResponse();
  }

  try {
    const result = await completeUpload(userId, assetId);

    if (!result.ok) {
      const error = result.error;
      if (typeof error === "object") {
        return jsonError(
          422,
          "VERIFICATION_FAILED",
          `Image verification failed: ${error.verification}`,
        );
      }
      switch (error) {
        case "NOT_FOUND":
          return notFoundResponse();
        case "INVALID_STATE":
          return jsonError(
            409,
            "INVALID_STATE",
            "This upload cannot be completed in its current state",
          );
        case "UPLOAD_MISSING":
          return jsonError(409, "UPLOAD_MISSING", "No uploaded file was found for this asset");
        case "TOO_LARGE":
          return jsonError(413, "TOO_LARGE", "The uploaded file exceeds the maximum allowed size");
        default:
          return accessErrorResponse(error);
      }
    }

    return NextResponse.json(
      {
        data: {
          status: result.status,
          width: result.width,
          height: result.height,
          contentType: result.contentType,
        },
      },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return jsonError(503, "STORAGE_UNAVAILABLE", "Media storage is not configured");
    }
    console.error("Failed to complete upload", error);
    return internalErrorResponse();
  }
}
