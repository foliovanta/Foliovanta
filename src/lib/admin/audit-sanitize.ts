// Safe presentation layer for audit metadata. Audit writers already redact, but
// the explorer treats metadata as potentially sensitive and NEVER renders raw
// JSON: only an allowlisted set of scalar fields survives, each value coerced to
// a primitive, string-capped, and secret-scrubbed. Unknown events fall back to
// the same allowlist, so a future event with unexpected metadata can only ever
// show safe generic fields. The stored record is never mutated.

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|credential|bearer/i;
const MAX_VALUE = 500;

// Scalar keys that are safe to surface across every known audit event family.
const SAFE_KEYS = new Set([
  "fromState",
  "toState",
  "reason", // moderator-authored justification, or a denial reason enum
  "previousRole",
  "newRole",
  "via",
  "hasNote",
  "restrictive",
]);

// A value that itself looks like a long opaque token is redacted defensively.
function scrubValue(value: unknown): string | number | boolean | null {
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (/^[A-Za-z0-9._-]{40,}$/.test(value)) return "[redacted]";
    return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value;
  }
  return null; // objects/arrays are never surfaced
}

export type SafeAuditMetadata = Record<string, string | number | boolean | null>;

export function sanitizeAuditMetadata(metadata: unknown): SafeAuditMetadata {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return {};
  const out: SafeAuditMetadata = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (!SAFE_KEYS.has(key)) continue; // allowlist only
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    const scrubbed = scrubValue(value);
    if (scrubbed !== null || value === null) out[key] = scrubbed;
  }
  return out;
}

export type AuditActionFamily = "moderation" | "feedback" | "report" | "admin" | "other";

export function auditActionFamily(action: string): AuditActionFamily {
  const head = action.split(".")[0];
  if (head === "moderation" || head === "feedback" || head === "report" || head === "admin") return head;
  return "other";
}

/**
 * A short, safe human summary for a list row, derived only from allowlisted
 * fields — never from raw metadata. e.g. "CLEAR → SUSPENDED" for a moderation
 * event, "denied: FORBIDDEN" for a denial.
 */
export function safeAuditSummary(action: string, metadata: SafeAuditMetadata): string {
  if (action.endsWith(".denied")) {
    return typeof metadata.reason === "string" ? `denied: ${metadata.reason}` : "denied";
  }
  if (typeof metadata.fromState === "string" && typeof metadata.toState === "string") {
    return `${metadata.fromState} → ${metadata.toState}`;
  }
  if (action === "admin.role.granted" && typeof metadata.newRole === "string") {
    return `role → ${metadata.newRole}`;
  }
  return "";
}
