import { NextResponse } from "next/server";

import type { PortfolioAccessError } from "@/lib/portfolios/get-portfolios";

export const noStoreHeaders = {
  "Cache-Control": "no-store",
};

const accessErrorStatus: Record<PortfolioAccessError, number> = {
  USER_NOT_SYNCED: 404,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_UNAVAILABLE: 403,
};

const accessErrorMessage: Record<PortfolioAccessError, string> = {
  USER_NOT_SYNCED: "User account is being synchronized",
  ACCOUNT_SUSPENDED: "Your account is suspended",
  ACCOUNT_UNAVAILABLE: "Your account is unavailable",
};

export function accessErrorResponse(error: PortfolioAccessError) {
  return NextResponse.json(
    { error: { code: error, message: accessErrorMessage[error] } },
    { status: accessErrorStatus[error], headers: noStoreHeaders },
  );
}

export function unauthenticatedResponse() {
  return NextResponse.json(
    { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
    { status: 401, headers: noStoreHeaders },
  );
}

export function notFoundResponse() {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Portfolio not found" } },
    { status: 404, headers: noStoreHeaders },
  );
}

export function revisionConflictResponse() {
  return NextResponse.json(
    {
      error: {
        code: "REVISION_CONFLICT",
        message: "The portfolio draft was changed by another request",
      },
    },
    { status: 409, headers: noStoreHeaders },
  );
}

export function internalErrorResponse() {
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Unable to process the request" } },
    { status: 500, headers: noStoreHeaders },
  );
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: noStoreHeaders });
}

export function invalidIdResponse() {
  return jsonError(400, "INVALID_ID", "Invalid id");
}

export function validationErrorResponse(details: unknown) {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Request validation failed", details } },
    { status: 400, headers: noStoreHeaders },
  );
}

// Maps a service failure code (from resolveActiveUser / mutateDraft / content
// services) to its HTTP response. Unowned/deleted/nonexistent resources all
// return a uniform 404.
export function mutationErrorResponse(error: string) {
  switch (error) {
    case "USER_NOT_SYNCED":
    case "ACCOUNT_SUSPENDED":
    case "ACCOUNT_UNAVAILABLE":
      return accessErrorResponse(error);
    case "NOT_FOUND":
    case "PROJECT_NOT_FOUND":
      return notFoundResponse();
    case "REVISION_CONFLICT":
      return revisionConflictResponse();
    case "PROJECT_LIMIT_REACHED":
      return jsonError(409, "PROJECT_LIMIT_REACHED", "Project limit reached for this portfolio");
    case "DUPLICATE_PROJECT_IDS":
      return jsonError(400, "DUPLICATE_PROJECT_IDS", "Project ids must be unique");
    case "UNKNOWN_PROJECT_IDS":
      return jsonError(
        400,
        "UNKNOWN_PROJECT_IDS",
        "Reorder must list exactly the portfolio's projects",
      );
    case "CONTENT_LIMIT_REACHED":
      return jsonError(409, "CONTENT_LIMIT_REACHED", "Item limit reached for this portfolio");
    case "DUPLICATE_IDS":
      return jsonError(400, "DUPLICATE_IDS", "Ids must be unique");
    case "UNKNOWN_IDS":
      return jsonError(400, "UNKNOWN_IDS", "Reorder must list exactly the portfolio's items");
    case "INVALID_DATE_RANGE":
      return jsonError(422, "INVALID_DATE_RANGE", "End date must be on or after start date");
    case "CURRENT_WITH_END_DATE":
      return jsonError(422, "CURRENT_WITH_END_DATE", "A current role cannot have an end date");
    case "INVALID_SECTION_KEY":
      return jsonError(400, "INVALID_SECTION_KEY", "Unknown section key");
    default:
      return internalErrorResponse();
  }
}
