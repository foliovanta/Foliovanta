import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "font-fraunces", className: "font-fraunces" }),
}));

import { isRenderable, resolveTemplate } from "@/components/public/templates";

describe("template registry", () => {
  it("resolves the Minimal template without a fallback flag", () => {
    const { template, isFallback } = resolveTemplate("minimal");
    expect(template.key).toBe("minimal");
    expect(isFallback).toBe(false);
  });

  it("flags an explicit fallback for unbuilt templates (not silent)", () => {
    const professional = resolveTemplate("professional");
    expect(professional.template.key).toBe("minimal");
    expect(professional.isFallback).toBe(true);
    expect(resolveTemplate("creative").isFallback).toBe(true);
  });

  it("reports schema- and template-version renderability", () => {
    const { template } = resolveTemplate("minimal");
    expect(isRenderable(template, "1.0.0", 1)).toBe(true);
    expect(isRenderable(template, "2.0.0", 1)).toBe(false); // unsupported template version
    expect(isRenderable(template, "1.0.0", 2)).toBe(false); // unsupported schema version
  });
});
