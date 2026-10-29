import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const stub = () => ({ variable: "font-stub", className: "font-stub" });
  return { Fraunces: stub, Inter: stub, Space_Grotesk: stub, Source_Serif_4: stub };
});

import { resolvePortfolioDesign } from "@/components/public/design";
import {
  DESIGN_CONFIG_VERSION,
  MODE_BACKGROUND,
  type DesignConfig,
  paletteAccent,
} from "@/lib/design/config";
import { MIN_CONTRAST, contrastRatio } from "@/lib/design/contrast";

const config = (o: Partial<DesignConfig> = {}): DesignConfig => ({
  version: DESIGN_CONFIG_VERSION,
  mode: "light",
  palette: "indigo",
  accent: null,
  headingFont: "fraunces",
  bodyFont: "inter",
  layouts: { projects: "list", experience: "timeline", skills: "grouped" },
  ...o,
});

describe("resolvePortfolioDesign", () => {
  it("falls back to template defaults for an empty (legacy v1) theme", () => {
    const minimal = resolvePortfolioDesign({}, "minimal");
    expect(minimal.mode).toBe("light");
    expect(minimal.cssVars["--bg"]).toBe(MODE_BACKGROUND.light);

    // Creative's identity default is dark.
    const creative = resolvePortfolioDesign({}, "creative");
    expect(creative.mode).toBe("dark");
    expect(creative.cssVars["--bg"]).toBe(MODE_BACKGROUND.dark);
  });

  it("resolves light and dark token sets", () => {
    const light = resolvePortfolioDesign(config({ mode: "light" }), "minimal");
    expect(light.cssVars["--fg"]).toBe("#18181b");
    const dark = resolvePortfolioDesign(config({ mode: "dark" }), "minimal");
    expect(dark.cssVars["--fg"]).toBe("#fafafa");
  });

  it("uses a custom accent when it meets contrast on the mode background", () => {
    const resolved = resolvePortfolioDesign(
      config({ mode: "light", accent: "#047857" }),
      "minimal",
    );
    expect(resolved.cssVars["--accent"]).toBe("#047857");
  });

  it("rejects a custom accent that fails contrast on the ACTUAL background (dark)", () => {
    // A dark accent readable nowhere on near-black must not ship in dark mode.
    const resolved = resolvePortfolioDesign(
      config({ mode: "dark", palette: "indigo", accent: "#222233" }),
      "creative",
    );
    expect(resolved.cssVars["--accent"]).not.toBe("#222233");
    expect(resolved.cssVars["--accent"]).toBe(paletteAccent("indigo", "dark"));
    expect(
      contrastRatio(resolved.cssVars["--accent"]!, MODE_BACKGROUND.dark),
    ).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("preserves a legacy top-level hex accent from an otherwise-unrecognised theme", () => {
    const resolved = resolvePortfolioDesign({ accent: "#be123c" }, "minimal");
    expect(resolved.cssVars["--accent"]).toBe("#be123c");
  });

  it("falls back to defaults for junk theme data", () => {
    const resolved = resolvePortfolioDesign({ mode: "neon", palette: 7 }, "minimal");
    expect(resolved.mode).toBe("light");
    expect(resolved.layouts.projects).toBe("list");
  });

  it("passes layout presets through", () => {
    const resolved = resolvePortfolioDesign(
      config({ layouts: { projects: "grid", experience: "stacked", skills: "compact" } }),
      "minimal",
    );
    expect(resolved.layouts).toEqual({
      projects: "grid",
      experience: "stacked",
      skills: "compact",
    });
  });
});
