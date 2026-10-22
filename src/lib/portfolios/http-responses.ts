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

export function internalErrorResponse() {
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Unable to process the request" } },
    { status: 500, headers: noStoreHeaders },
  );
}
