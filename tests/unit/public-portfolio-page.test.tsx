// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "font-fraunces", className: "font-fraunces" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/publishing/public-read", () => ({ getPublicPortfolioByUserSlug: vi.fn() }));

import PublicPortfolioPage, { generateMetadata } from "@/app/[publicSlug]/[username]/page";
import { getPublicPortfolioByUserSlug } from "@/lib/publishing/public-read";
import type { PublishedSnapshot } from "@/lib/publishing/snapshot";

const readMock = vi.mocked(getPublicPortfolioByUserSlug);
const params = (publicSlug: string, username: string) => ({
  params: Promise.resolve({ publicSlug, username }),
});

const snapshot: PublishedSnapshot = {
  schemaVersion: 1,
  portfolio: { slug: "ada", templateKey: "minimal", templateVersion: "1.0.0", theme: {} },
  profile: {
    displayName: "Ada Lovelace",
    headline: "Mathematician",
    bio: "Pioneer of computing.",
    location: null,
    avatarAssetId: null,
    emailPublic: null,
  },
  sections: [],
  projects: [],
  experience: [],
  education: [],
  skills: [],
};

const visible = {
  ok: true as const,
  snapshot,
  versionNumber: 1,
  publicSlug: "10482",
  username: "ada",
};

describe("public portfolio page (/[publicSlug]/[username])", () => {
  beforeEach(() => readMock.mockReset());

  it("builds indexable metadata with a canonical to the current username", async () => {
    readMock.mockResolvedValue(visible);
    const meta = await generateMetadata(params("10482", "ada"));
    expect(meta.title).toBe("Ada Lovelace — Mathematician");
    expect(meta.description).toBe("Pioneer of computing.");
    expect(String(meta.alternates?.canonical)).toMatch(/\/10482\/ada$/);
    expect(meta.robots).toMatchObject({ index: true });
  });

  it("returns noindex metadata for a non-visible portfolio", async () => {
    readMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const meta = await generateMetadata(params("10482", "ada"));
    expect(meta.robots).toMatchObject({ index: false });
  });

  it("calls notFound() for a non-visible portfolio", async () => {
    readMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    await expect(PublicPortfolioPage(params("10482", "ada"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders for a visible portfolio at the canonical username", async () => {
    readMock.mockResolvedValue(visible);
    const element = await PublicPortfolioPage(params("10482", "ada"));
    expect(element).toBeTruthy();
  });

  it("redirects a stale username to the canonical URL", async () => {
    readMock.mockResolvedValue(visible);
    await expect(PublicPortfolioPage(params("10482", "old-name"))).rejects.toThrow(
      "NEXT_REDIRECT:/10482/ada",
    );
  });
});
