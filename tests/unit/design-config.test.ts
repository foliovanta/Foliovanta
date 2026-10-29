import { describe, expect, it } from "vitest";

import {
  BODY_FONTS,
  DESIGN_CONFIG_VERSION,
  HEADING_FONTS,
  MODE_BACKGROUND,
  PALETTES,
  TEMPLATE_DESIGN_DEFAULTS,
  type DesignConfig,
  defaultDesignForTemplate,
  designConfigSchema,
} from "@/lib/design/config";
import { MIN_CONTRAST, contrastRatio } from "@/lib/design/contrast";

const valid: DesignConfig = {
  version: DESIGN_CONFIG_VERSION,
  mode: "light",
  palette: "indigo",
  accent: null,
  headingFont: "fraunces",
  bodyFont: "inter",
  layouts: { projects: "list", experience: "timeline", skills: "grouped" },
};

describe("designConfigSchema", () => {
  it("accepts a well-formed config", () => {
    expect(designConfigSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid custom accent hex and null", () => {
    expect(designConfigSchema.safeParse({ ...valid, accent: "#abcdef" }).success).toBe(true);
    expect(designConfigSchema.safeParse({ ...valid, accent: null }).success).toBe(true);
  });

  it("rejects unknown enums, bad accent, extra keys, and wrong version", () => {
    expect(designConfigSchema.safeParse({ ...valid, mode: "sepia" }).success).toBe(false);
    expect(designConfigSchema.safeParse({ ...valid, palette: "neon" }).success).toBe(false);
    expect(designConfigSchema.safeParse({ ...valid, headingFont: "comic-sans" }).success).toBe(
      false,
    );
    expect(designConfigSchema.safeParse({ ...valid, accent: "red" }).success).toBe(false);
    expect(designConfigSchema.safeParse({ ...valid, accent: "#fff" }).success).toBe(false);
    expect(designConfigSchema.safeParse({ ...valid, version: 2 }).success).toBe(false);
    expect(designConfigSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(designConfigSchema.safeParse({ ...valid, layouts: { projects: "list" } }).success).toBe(
      false,
    );
  });

  it("limits fonts to the curated allowlists", () => {
    expect(HEADING_FONTS).toEqual(["fraunces", "space-grotesk", "inter"]);
    expect(BODY_FONTS).toEqual(["inter", "source-serif"]);
  });
});

describe("curated palettes", () => {
  it("every palette accent meets AA against its mode background", () => {
    for (const palette of PALETTES) {
      expect(contrastRatio(palette.light, MODE_BACKGROUND.light)).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
      expect(contrastRatio(palette.dark, MODE_BACKGROUND.dark)).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});

describe("template design defaults", () => {
  it("every template default is itself a valid config", () => {
    for (const key of ["minimal", "professional", "creative"] as const) {
      const defaults = defaultDesignForTemplate(key);
      expect(defaults).toBe(TEMPLATE_DESIGN_DEFAULTS[key]);
      expect(designConfigSchema.safeParse(defaults).success).toBe(true);
    }
  });
});
