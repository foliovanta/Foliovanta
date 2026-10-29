import { describe, expect, it } from "vitest";

import { auditActionFamily, safeAuditSummary, sanitizeAuditMetadata } from "@/lib/admin/audit-sanitize";

describe("sanitizeAuditMetadata", () => {
  it("keeps only allowlisted scalar keys", () => {
    const safe = sanitizeAuditMetadata({
      fromState: "CLEAR",
      toState: "SUSPENDED",
      reason: "spam",
      idempotencyKey: "idem-123", // not allowlisted → dropped
      revocation: { mechanism: "x" }, // object → dropped
    });
    expect(safe).toEqual({ fromState: "CLEAR", toState: "SUSPENDED", reason: "spam" });
  });

  it("redacts sensitive-looking allowlisted keys and token-like values", () => {
    // 'reason' is allowlisted; a token-like value is still scrubbed.
    expect(sanitizeAuditMetadata({ reason: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP123" })).toEqual({
      reason: "[redacted]",
    });
  });

  it("caps very long strings", () => {
    const long = "word ".repeat(300);
    const safe = sanitizeAuditMetadata({ reason: long }) as { reason: string };
    expect(safe.reason.length).toBeLessThan(long.length);
    expect(safe.reason.endsWith("…")).toBe(true);
  });

  it("returns {} for non-object / null / array metadata", () => {
    expect(sanitizeAuditMetadata(null)).toEqual({});
    expect(sanitizeAuditMetadata("raw")).toEqual({});
    expect(sanitizeAuditMetadata([1, 2])).toEqual({});
  });

  it("never surfaces an unknown free-form key", () => {
    expect(sanitizeAuditMetadata({ email: "a@b.c", draftBody: "secret notes" })).toEqual({});
  });
});

describe("auditActionFamily", () => {
  it("derives the family from the first segment", () => {
    expect(auditActionFamily("moderation.portfolio.suspend")).toBe("moderation");
    expect(auditActionFamily("feedback.resolved")).toBe("feedback");
    expect(auditActionFamily("report.actioned")).toBe("report");
    expect(auditActionFamily("admin.role.granted")).toBe("admin");
    expect(auditActionFamily("weird")).toBe("other");
  });
});

describe("safeAuditSummary", () => {
  it("summarizes known shapes without raw metadata", () => {
    expect(safeAuditSummary("moderation.portfolio.suspend", { fromState: "CLEAR", toState: "SUSPENDED" })).toBe("CLEAR → SUSPENDED");
    expect(safeAuditSummary("admin.overview.read.denied", { reason: "FORBIDDEN" })).toBe("denied: FORBIDDEN");
    expect(safeAuditSummary("admin.role.granted", { newRole: "ADMIN" })).toBe("role → ADMIN");
    expect(safeAuditSummary("unknown.event", {})).toBe("");
  });
});
