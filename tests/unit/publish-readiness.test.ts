import { describe, expect, it } from "vitest";

import type { PortfolioDraftInput } from "@/lib/publishing/snapshot";
import { evaluatePublishReadiness } from "@/lib/publishing/publish-readiness";

function baseInput(overrides: Partial<PortfolioDraftInput> = {}): PortfolioDraftInput {
  return {
    slug: "ada-lovelace",
    templateKey: null,
    templateVersion: null,
    theme: null,
    profile: {
      displayName: "Ada",
      headline: null,
      bio: null,
      location: null,
      avatarAssetId: null,
      emailPublic: null,
    },
    sections: [],
    projects: [],
    experience: [],
    education: [],
    skills: [],
    ...overrides,
  };
}

const codes = (result: ReturnType<typeof evaluatePublishReadiness>) =>
  result.ok ? [] : result.issues.map((i) => i.code);

describe("evaluatePublishReadiness", () => {
  it("passes a minimal valid draft with no content collections", () => {
    expect(evaluatePublishReadiness(baseInput())).toEqual({ ok: true });
  });

  it("requires a non-empty display name", () => {
    const blank = evaluatePublishReadiness(
      baseInput({ profile: { ...baseInput().profile!, displayName: "  " } }),
    );
    expect(blank.ok).toBe(false);
    expect(codes(blank)).toContain("REQUIRED");

    const missing = evaluatePublishReadiness(baseInput({ profile: null }));
    expect(codes(missing)).toContain("REQUIRED");
  });

  it("flags an invalid or reserved slug", () => {
    expect(codes(evaluatePublishReadiness(baseInput({ slug: "Bad Slug" })))).toContain(
      "INVALID_SLUG",
    );
    expect(codes(evaluatePublishReadiness(baseInput({ slug: "admin" })))).toContain(
      "RESERVED_SLUG",
    );
  });

  it("flags an unsupported template", () => {
    expect(codes(evaluatePublishReadiness(baseInput({ templateKey: "fancy" })))).toContain(
      "UNSUPPORTED_TEMPLATE",
    );
  });

  it("flags a non-http(s) project URL with a field path", () => {
    const result = evaluatePublishReadiness(
      baseInput({
        projects: [
          {
            id: "p",
            title: "T",
            summary: null,
            description: null,
            projectUrl: "ftp://x",
            repositoryUrl: null,
            coverAssetId: null,
            isFeatured: false,
            position: 0,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({
        field: "projects.0.projectUrl",
        code: "INVALID_URL",
      });
    }
  });

  it("flags invalid experience dates", () => {
    const range = evaluatePublishReadiness(
      baseInput({
        experience: [
          {
            id: "e",
            organization: "A",
            roleTitle: "R",
            location: null,
            startDate: new Date("2022-01-01"),
            endDate: new Date("2020-01-01"),
            isCurrent: false,
            description: null,
            position: 0,
          },
        ],
      }),
    );
    expect(codes(range)).toContain("INVALID_DATE_RANGE");

    const current = evaluatePublishReadiness(
      baseInput({
        experience: [
          {
            id: "e",
            organization: "A",
            roleTitle: "R",
            location: null,
            startDate: new Date("2020-01-01"),
            endDate: new Date("2021-01-01"),
            isCurrent: true,
            description: null,
            position: 0,
          },
        ],
      }),
    );
    expect(codes(current)).toContain("CURRENT_WITH_END_DATE");
  });

  it("does not invent mandatory content requirements", () => {
    // Valid slug + display name, but every content collection empty → publishable.
    const result = evaluatePublishReadiness(baseInput());
    expect(result).toEqual({ ok: true });
  });
});
