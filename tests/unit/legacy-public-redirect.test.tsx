// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/publishing/public-read", () => ({ getPublicPortfolio: vi.fn() }));

import LegacyPublicPortfolioPage from "@/app/p/[slug]/page";
import { getPublicPortfolio } from "@/lib/publishing/public-read";
import type { PublishedSnapshot } from "@/lib/publishing/snapshot";

const readMock = vi.mocked(getPublicPortfolio);
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

const snapshot = { schemaVersion: 1 } as unknown as PublishedSnapshot;

describe("legacy /p/[slug] redirect", () => {
  beforeEach(() => readMock.mockReset());

  it("permanently redirects a publicly visible portfolio to its canonical URL", async () => {
    readMock.mockResolvedValue({
      ok: true,
      snapshot,
      versionNumber: 1,
      publicSlug: "10482",
      username: "ada",
    });
    await expect(LegacyPublicPortfolioPage(params("ada"))).rejects.toThrow(
      "NEXT_REDIRECT:/10482/ada",
    );
  });

  it("404s (no redirect) when the portfolio is not publicly visible", async () => {
    readMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    await expect(LegacyPublicPortfolioPage(params("hidden"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
