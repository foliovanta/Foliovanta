// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the composed element instead of running satori.
vi.mock("next/og", () => ({
  // Constructable (used with `new`); captures the composed element.
  ImageResponse: vi.fn(function (this: { element: unknown }, element: unknown) {
    this.element = element;
  }),
}));
vi.mock("@/lib/publishing/public-read", () => ({ getPublicPortfolioByUserSlug: vi.fn() }));

import OpengraphImage, { size } from "@/app/[publicSlug]/[username]/opengraph-image";
import { getPublicPortfolioByUserSlug } from "@/lib/publishing/public-read";
import { ImageResponse } from "next/og";

const readMock = vi.mocked(getPublicPortfolioByUserSlug);
const imageMock = vi.mocked(ImageResponse);
const params = (publicSlug: string) => ({
  params: Promise.resolve({ publicSlug, username: "ada" }),
});

const lastElementText = () => JSON.stringify(imageMock.mock.calls.at(-1)![0]);

const snapshot = (displayName: string, headline: string | null) =>
  ({
    schemaVersion: 1,
    portfolio: { slug: "ada", templateKey: "minimal", templateVersion: "1.0.0", theme: {} },
    profile: {
      displayName,
      headline,
      bio: null,
      location: null,
      avatarAssetId: null,
      emailPublic: null,
    },
    sections: [],
    projects: [],
    experience: [],
    education: [],
    skills: [],
  }) as never;

describe("opengraph-image", () => {
  beforeEach(() => {
    readMock.mockReset();
    imageMock.mockClear();
  });

  it("is sized 1200×630", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("renders the published name, headline and branding", async () => {
    readMock.mockResolvedValue({
      ok: true,
      snapshot: snapshot("Ada Lovelace", "Mathematician"),
      versionNumber: 1,
      publicSlug: "10482",
      username: "ada",
    });
    await OpengraphImage(params("10482"));
    const text = lastElementText();
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Mathematician");
    expect(text).toContain("Foliovanta");
  });

  it("falls back to a generic branded card for an unavailable portfolio", async () => {
    readMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    await OpengraphImage(params("10482"));
    const text = lastElementText();
    expect(text).toContain("A portfolio");
    expect(text).toContain("Foliovanta");
  });
});
