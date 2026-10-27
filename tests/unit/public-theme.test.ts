import { describe, expect, it } from "vitest";

import { resolvePortfolioTheme } from "@/components/public/theme";

describe("resolvePortfolioTheme", () => {
  it("returns the Minimal default for an empty/absent theme", () => {
    expect(resolvePortfolioTheme({})).toEqual({ accent: "#4338ca" });
    expect(resolvePortfolioTheme(null)).toEqual({ accent: "#4338ca" });
    expect(resolvePortfolioTheme(undefined)).toEqual({ accent: "#4338ca" });
  });

  it("accepts a valid hex accent", () => {
    expect(resolvePortfolioTheme({ accent: "#aa00ff" })).toEqual({ accent: "#aa00ff" });
  });

  it("rejects unsafe or malformed accent values", () => {
    expect(resolvePortfolioTheme({ accent: "red; background:url(x)" }).accent).toBe("#4338ca");
    expect(resolvePortfolioTheme({ accent: "#fff" }).accent).toBe("#4338ca");
    expect(resolvePortfolioTheme({ accent: 123 }).accent).toBe("#4338ca");
  });

  it("rejects a valid hex that fails contrast against white", () => {
    // #ffff00 (yellow) is well-formed but ~1.07:1 on white — unreadable as link text.
    expect(resolvePortfolioTheme({ accent: "#ffff00" }).accent).toBe("#4338ca");
    expect(resolvePortfolioTheme({ accent: "#eeeeee" }).accent).toBe("#4338ca");
  });
});
