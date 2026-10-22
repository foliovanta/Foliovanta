import {
  MAX_PORTFOLIO_SLUG_LENGTH,
  isReservedPortfolioSlug,
  normalizePortfolioSlug,
} from "@/lib/utils/slug";
import { describe, expect, it } from "vitest";

describe("isReservedPortfolioSlug", () => {
  it("rejects reserved system names", () => {
    expect(isReservedPortfolioSlug("admin")).toBe(true);
    expect(isReservedPortfolioSlug("api")).toBe(true);
    expect(isReservedPortfolioSlug("www")).toBe(true);
  });

  it("allows ordinary names", () => {
    expect(isReservedPortfolioSlug("rishab-thakur")).toBe(false);
  });

  it("only matches canonical form", () => {
    // A reserved word only collides once normalized; callers must normalize first.
    expect(isReservedPortfolioSlug(normalizePortfolioSlug("Admin"))).toBe(true);
  });
});

describe("MAX_PORTFOLIO_SLUG_LENGTH", () => {
  it("bounds slugs to the public hostname limit", () => {
    expect(MAX_PORTFOLIO_SLUG_LENGTH).toBe(63);
  });
});
