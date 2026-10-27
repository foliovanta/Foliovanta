import { describe, expect, it } from "vitest";

import { DEFAULT_USERNAME, deriveUsername, normalizeUsername } from "@/lib/utils/username";

describe("normalizeUsername", () => {
  it("lowercases, trims, and hyphenates spaces", () => {
    expect(normalizeUsername("  Rishab Thakur ")).toBe("rishab-thakur");
  });

  it("strips diacritics", () => {
    expect(normalizeUsername("Café Señor")).toBe("cafe-senor");
  });

  it("collapses runs of punctuation into a single hyphen and trims edges", () => {
    expect(normalizeUsername("--a__b  c!!--")).toBe("a-b-c");
  });

  it("returns empty string for input with no usable characters", () => {
    expect(normalizeUsername("!!! ✨ ---")).toBe("");
  });

  it("caps length and never leaves a trailing hyphen", () => {
    const result = normalizeUsername("a".repeat(50) + " " + "b".repeat(50));
    expect(result.length).toBeLessThanOrEqual(39);
    expect(result.endsWith("-")).toBe(false);
  });
});

describe("deriveUsername", () => {
  it("uses the first normalizable source", () => {
    expect(deriveUsername(null, "", "Grace Hopper")).toBe("grace-hopper");
  });

  it("falls back to the default when nothing is usable", () => {
    expect(deriveUsername("", "!!!", null)).toBe(DEFAULT_USERNAME);
  });
});
