import { describe, expect, it, vi } from "vitest";

// All three templates load a Google font at module scope; stub them so the
// registry can be imported in jsdom without network/font resolution.
vi.mock("next/font/google", () => {
  const stub = () => ({ variable: "font-stub", className: "font-stub" });
  return { Fraunces: stub, Inter: stub, Space_Grotesk: stub, Source_Serif_4: stub };
});

import { isRenderable, resolveTemplate } from "@/components/public/templates";
import { TEMPLATE_KEYS } from "@/lib/publishing/snapshot";

describe("template registry", () => {
  it("resolves every registry key to its own template, no fallback", () => {
    for (const key of TEMPLATE_KEYS) {
      const { template, isFallback } = resolveTemplate(key);
      expect(template.key).toBe(key);
      expect(isFallback).toBe(false);
    }
  });

  it("registers exactly minimal, professional, and creative", () => {
    expect([...TEMPLATE_KEYS]).toEqual(["minimal", "professional", "creative"]);
  });

  it("reports schema- and template-version renderability per template", () => {
    for (const key of TEMPLATE_KEYS) {
      const { template } = resolveTemplate(key);
      expect(isRenderable(template, "1.0.0", 1)).toBe(true);
      expect(isRenderable(template, "2.0.0", 1)).toBe(false); // unsupported template version
      expect(isRenderable(template, "1.0.0", 2)).toBe(false); // unsupported schema version
    }
  });

  it("flags a fallback only for a key outside the registry (never cross-template)", () => {
    // Cast an unknown key the schema would normally reject.
    const result = resolveTemplate("legacy" as never);
    expect(result.isFallback).toBe(true);
    expect(result.template.key).toBe("minimal");
  });
});
