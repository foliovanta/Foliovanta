import { describe, expect, it } from "vitest";

import { type VisibilityFields, evaluatePublicVisibility } from "@/lib/publishing/visibility";

const visible: VisibilityFields = {
  deletedAt: null,
  publicationStatus: "PUBLISHED",
  moderationStatus: "CLEAR",
  activeVersionId: "11111111-1111-1111-1111-111111111111",
  ownerStatus: "ACTIVE",
};

describe("evaluatePublicVisibility", () => {
  it("is eligible when every condition passes", () => {
    expect(evaluatePublicVisibility(visible)).toEqual({ eligible: true, reasons: [] });
  });

  it("reports each failing condition", () => {
    expect(evaluatePublicVisibility({ ...visible, deletedAt: new Date() }).reasons).toContain(
      "Portfolio is deleted",
    );
    expect(evaluatePublicVisibility({ ...visible, publicationStatus: "DRAFT" }).reasons).toContain(
      "Not published (status: DRAFT)",
    );
    expect(
      evaluatePublicVisibility({ ...visible, moderationStatus: "SUSPENDED" }).reasons,
    ).toContain("Suspended by moderation");
    expect(evaluatePublicVisibility({ ...visible, activeVersionId: null }).reasons).toContain(
      "No active published version",
    );
    expect(evaluatePublicVisibility({ ...visible, ownerStatus: "SUSPENDED" }).reasons).toContain(
      "Owner account is not active",
    );
  });

  it("is not eligible and collects multiple reasons", () => {
    const result = evaluatePublicVisibility({
      ...visible,
      publicationStatus: "UNPUBLISHED",
      activeVersionId: null,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.length).toBe(2);
  });

  it("UNDER_REVIEW does not by itself block visibility (only SUSPENDED does)", () => {
    expect(evaluatePublicVisibility({ ...visible, moderationStatus: "UNDER_REVIEW" }).eligible).toBe(
      true,
    );
  });
});
