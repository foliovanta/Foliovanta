import "server-only";

import { NextResponse } from "next/server";

import type { AuthzFailure } from "@/lib/auth/authorization";

export const noStoreHeaders = { "Cache-Control": "no-store" } as const;

/**
 * Per-request correlation id: reuse an inbound `x-request-id` (set by the
 * platform/proxy) when present, else mint one. Links an admin response to its
 * audit records and operational logs.
 */
export function correlationId(request: Request): string {
  const inbound = request.headers.get("x-request-id");
  if (inbound && inbound.length <= 200) return inbound;
  return crypto.randomUUID();
}

/**
 * Safe, uniform error response for an authorization failure. Anonymous callers
 * get 401; every authenticated-but-denied case gets an identical 403 body, so
 * the admin surface never reveals whether the caller was close to authorized.
 * The specific internal reason is audited, not returned.
 */
export function adminErrorResponse(failure: AuthzFailure, correlationIdValue: string) {
  const anonymous = failure.reason === "UNAUTHENTICATED";
  return NextResponse.json(
    {
      error: {
        code: anonymous ? "UNAUTHENTICATED" : "FORBIDDEN",
        message: anonymous ? "Authentication required" : "You do not have access to this resource",
      },
    },
    { status: failure.status, headers: { ...noStoreHeaders, "x-correlation-id": correlationIdValue } },
  );
}

export function adminJson<T>(data: T, correlationIdValue: string, status = 200) {
  return NextResponse.json(
    { data },
    { status, headers: { ...noStoreHeaders, "x-correlation-id": correlationIdValue } },
  );
}

export function adminError(
  correlationIdValue: string,
  status: number,
  code: string,
  message: string,
) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...noStoreHeaders, "x-correlation-id": correlationIdValue } },
  );
}

export function adminValidationError(correlationIdValue: string, message: string) {
  return NextResponse.json(
    { error: { code: "INVALID_REQUEST", message } },
    { status: 400, headers: { ...noStoreHeaders, "x-correlation-id": correlationIdValue } },
  );
}

export function adminNotFoundResponse(correlationIdValue: string) {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Resource not found" } },
    { status: 404, headers: { ...noStoreHeaders, "x-correlation-id": correlationIdValue } },
  );
}

export function rateLimitResponse(retryAfterSeconds: number, correlationIdValue: string) {
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "Too many requests — slow down and retry shortly" } },
    {
      status: 429,
      headers: {
        ...noStoreHeaders,
        "x-correlation-id": correlationIdValue,
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

/** 503 for a fail-closed limiter outage on a privileged mutation. */
export function serviceUnavailableResponse(correlationIdValue: string) {
  return NextResponse.json(
    { error: { code: "SERVICE_UNAVAILABLE", message: "Temporarily unavailable — retry shortly" } },
    { status: 503, headers: { ...noStoreHeaders, "x-correlation-id": correlationIdValue } },
  );
}

/** Map a blocked RateLimitDecision to its response (429 or 503). */
export function rateLimitBlockedResponse(
  decision: { allowed: false; reason: "RATE_LIMITED"; retryAfterSeconds: number } | { allowed: false; reason: "UNAVAILABLE" },
  correlationIdValue: string,
) {
  return decision.reason === "RATE_LIMITED"
    ? rateLimitResponse(decision.retryAfterSeconds, correlationIdValue)
    : serviceUnavailableResponse(correlationIdValue);
}

/** Stable per-request identity for rate limiting: the admin's Clerk id, or a
 * coarse client-IP fallback for unauthenticated callers. */
export function rateLimitIdentity(request: Request, clerkUserId: string | null): string {
  if (clerkUserId) return `admin:user:${clerkUserId}`;
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `admin:anon:${ip}`;
}
