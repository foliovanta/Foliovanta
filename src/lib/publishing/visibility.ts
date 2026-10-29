// Single source of truth for "is this portfolio publicly visible?". The public
// read uses the Prisma `where` fragment; the admin portfolio detail reuses the
// pure evaluator so its eligibility summary can never drift from the real policy.
//
// Policy: a portfolio is publicly visible only when it is not soft-deleted, is
// PUBLISHED, is not moderated off (SUSPENDED), has an active published version,
// AND is owned by an ACTIVE account.

// Portfolio-level conditions (owner status is applied via the relation below).
export const PUBLICLY_VISIBLE_PORTFOLIO_WHERE = {
  deletedAt: null,
  publicationStatus: "PUBLISHED",
  moderationStatus: { not: "SUSPENDED" },
  activeVersionId: { not: null },
} as const;

// Owner-side condition, applied on the `owner` relation in a query.
export const PUBLICLY_VISIBLE_OWNER_WHERE = { status: "ACTIVE" } as const;

export type VisibilityFields = {
  deletedAt: Date | null;
  publicationStatus: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
  moderationStatus: "CLEAR" | "UNDER_REVIEW" | "SUSPENDED";
  activeVersionId: string | null;
  ownerStatus: "ACTIVE" | "SUSPENDED" | "DELETION_PENDING";
};

export type VisibilityResult = { eligible: boolean; reasons: string[] };

/**
 * Pure evaluation of the same policy as the `where` fragments above, against a
 * loaded portfolio. Returns `eligible` plus, when not eligible, human-readable
 * reasons for an admin eligibility summary. Must stay in lockstep with the
 * `where` fragments (an integration test asserts they agree).
 */
export function evaluatePublicVisibility(fields: VisibilityFields): VisibilityResult {
  const reasons: string[] = [];
  if (fields.deletedAt !== null) reasons.push("Portfolio is deleted");
  if (fields.publicationStatus !== "PUBLISHED") {
    reasons.push(`Not published (status: ${fields.publicationStatus})`);
  }
  if (fields.moderationStatus === "SUSPENDED") reasons.push("Suspended by moderation");
  if (fields.activeVersionId === null) reasons.push("No active published version");
  if (fields.ownerStatus !== "ACTIVE") reasons.push("Owner account is not active");
  return { eligible: reasons.length === 0, reasons };
}
