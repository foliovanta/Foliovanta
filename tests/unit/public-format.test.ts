import { describe, expect, it } from "vitest";

import {
  formatDateRange,
  formatMonthYear,
  initials,
  isSafeHttpUrl,
  linkLabel,
} from "@/components/public/format";

describe("public format helpers", () => {
  it("formats month/year without timezone drift", () => {
    expect(formatMonthYear("2020-01-01")).toBe("Jan 2020");
    expect(formatMonthYear("2019-12-31")).toBe("Dec 2019");
    expect(formatMonthYear(null)).toBeNull();
    expect(formatMonthYear("not-a-date")).toBeNull();
  });

  it("formats date ranges with Present semantics", () => {
    expect(formatDateRange("2020-01-01", "2022-06-01")).toBe("Jan 2020 – Jun 2022");
    expect(formatDateRange("2020-01-01", null, true)).toBe("Jan 2020 – Present");
    expect(formatDateRange("2020-01-01", null)).toBe("Jan 2020");
    expect(formatDateRange(null, null)).toBeNull();
  });

  it("accepts only http(s) URLs", () => {
    expect(isSafeHttpUrl("https://x.dev")).toBe(true);
    expect(isSafeHttpUrl("http://x.dev")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("/relative")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });

  it("builds readable link labels and initials", () => {
    expect(linkLabel("https://www.github.com/ada/proj")).toBe("github.com/ada/proj");
    expect(linkLabel("https://example.com/")).toBe("example.com");
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Ada")).toBe("AD");
    expect(initials("")).toBe("");
  });
});
