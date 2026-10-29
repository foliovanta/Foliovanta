import { describe, expect, it } from "vitest";

import { CURRENT_TEMPLATE_VERSION, isTemplateVersionSupported } from "@/lib/publishing/snapshot";

describe("isTemplateVersionSupported", () => {
  it("accepts a known key at its current version", () => {
    expect(isTemplateVersionSupported("minimal", CURRENT_TEMPLATE_VERSION.minimal)).toBe(true);
    expect(isTemplateVersionSupported("creative", CURRENT_TEMPLATE_VERSION.creative)).toBe(true);
  });
  it("rejects an unsupported version or unknown key", () => {
    expect(isTemplateVersionSupported("minimal", "9.9.9")).toBe(false);
    expect(isTemplateVersionSupported("unknown", "1.0.0")).toBe(false);
  });
});
