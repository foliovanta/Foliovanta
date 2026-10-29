import { afterEach, beforeEach, describe, expect, it } from "vitest";

import robots from "@/app/robots";

const original = process.env.NEXT_PUBLIC_APP_URL;

describe("robots", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://foliovanta.com";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("allows public pages but disallows private app and API routes", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules!;
    expect(rule.allow).toBe("/");
    for (const path of ["/editor", "/preview", "/dashboard", "/api/portfolios", "/api/internal"]) {
      expect(rule.disallow).toContain(path);
    }
    // The authorized media proxy stays crawlable for image indexing.
    expect(rule.disallow).not.toContain("/api/media");
    expect(result.sitemap).toBe("https://foliovanta.com/sitemap.xml");
  });
});
