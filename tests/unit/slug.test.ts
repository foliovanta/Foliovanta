import { normalizePortfolioSlug } from "@/lib/utils/slug";
import { describe, expect, it } from "vitest";

describe("normalizePortfolioSlug", () => {
  it("converts a name to a URL-friendly slug", () => {
    expect(normalizePortfolioSlug("Rishab Thakur")).toBe("rishab-thakur");
  });

  it("normalizes spaces and punctuation", () => {
    expect(normalizePortfolioSlug("  My Portfolio!  ")).toBe("my-portfolio");
  });

  it("handles accented Latin characters", () => {
    expect(normalizePortfolioSlug("José García")).toBe("jose-garcia");
  });

  it("returns an empty slug for unsupported characters", () => {
    expect(normalizePortfolioSlug("!!!")).toBe("");
  });
});
