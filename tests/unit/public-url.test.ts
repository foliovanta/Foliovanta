import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPublicOrigin, publicPortfolioPath, publicPortfolioUrl } from "@/lib/urls/public-url";

const original = process.env.NEXT_PUBLIC_APP_URL;

describe("public-url builder", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("builds the canonical path from publicSlug and username", () => {
    expect(publicPortfolioPath("10482", "rishab-thakur")).toBe("/10482/rishab-thakur");
  });

  it("uses the configured origin and strips a trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://foliovanta.com/";
    expect(getPublicOrigin()).toBe("https://foliovanta.com");
    expect(publicPortfolioUrl("10482", "ada")).toBe("https://foliovanta.com/10482/ada");
  });

  it("falls back to localhost when the origin is unset or invalid", () => {
    expect(getPublicOrigin()).toBe("http://localhost:3000");
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    expect(getPublicOrigin()).toBe("http://localhost:3000");
  });
});
