import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import type { CreatePendingAssetError } from "@/lib/media/asset-service";
import { StorageNotConfiguredError } from "@/lib/media/storage";
import { initiateUpload } from "@/lib/media/upload-service";
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

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  purpose: z.enum(["PROFILE_AVATAR", "PROJECT_COVER"]),
  contentType: z.string().min(1).max(100),
  byteSize: z.number().int().positive(),
});

const errorStatus: Record<CreatePendingAssetError, number> = {
  USER_NOT_SYNCED: 404,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_UNAVAILABLE: 403,
  NOT_FOUND: 404,
  INVALID_TYPE: 400,
  INVALID_SIZE: 400,
  QUOTA_EXCEEDED: 409,
  RATE_LIMITED: 429,
};

export async function POST(
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
    const result = await initiateUpload(userId, {
      portfolioId,
      purpose: parsed.data.purpose,
      contentType: parsed.data.contentType,
      byteSize: parsed.data.byteSize,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") return notFoundResponse();
      if (
        result.error === "USER_NOT_SYNCED" ||
        result.error === "ACCOUNT_SUSPENDED" ||
        result.error === "ACCOUNT_UNAVAILABLE"
      ) {
        return accessErrorResponse(result.error);
      }
      return jsonError(errorStatus[result.error], result.error, "Upload could not be initiated");
    }

    return NextResponse.json(
      { data: { assetId: result.assetId, upload: result.upload } },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return jsonError(503, "STORAGE_UNAVAILABLE", "Media storage is not configured");
    }
    console.error("Failed to initiate upload", error);
    return internalErrorResponse();
  }
}
