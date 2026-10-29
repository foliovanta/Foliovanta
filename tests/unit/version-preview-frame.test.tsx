// @vitest-environment node
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const stub = () => ({ variable: "font-stub", className: "font-stub" });
  return { Fraunces: stub, Inter: stub, Space_Grotesk: stub, Source_Serif_4: stub };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/publishing/preview", () => ({ buildVersionPreview: vi.fn() }));

import VersionPreviewFramePage, {
  metadata,
} from "@/app/preview/[portfolioId]/version/[versionNumber]/page";
import { auth } from "@clerk/nextjs/server";
import { buildVersionPreview } from "@/lib/publishing/preview";
import type { PublishedSnapshot } from "@/lib/publishing/snapshot";

const authMock = vi.mocked(auth);
const previewMock = vi.mocked(buildVersionPreview);
const PID = randomUUID();
const params = (portfolioId: string, versionNumber: string) => ({
  params: Promise.resolve({ portfolioId, versionNumber }),
});

const snapshot = {
  schemaVersion: 1,
  portfolio: { slug: "ada", templateKey: "minimal", templateVersion: "1.0.0", theme: {} },
  profile: {
    displayName: "Ada",
    headline: null,
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
} as PublishedSnapshot;

describe("version preview frame page", () => {
  beforeEach(() => {
    authMock.mockReset();
    previewMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("is marked noindex/nofollow", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("404s an invalid portfolio id or version number", async () => {
    await expect(VersionPreviewFramePage(params("not-a-uuid", "1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(VersionPreviewFramePage(params(PID, "0"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(VersionPreviewFramePage(params(PID, "abc"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("404s when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    await expect(VersionPreviewFramePage(params(PID, "1"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s (uniform) when the caller is not the owner", async () => {
    previewMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    await expect(VersionPreviewFramePage(params(PID, "1"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders an explicit unavailable state for an unrenderable version", async () => {
    previewMock.mockResolvedValue({ ok: false, error: "UNRENDERABLE" });
    const element = await VersionPreviewFramePage(params(PID, "1"));
    expect(element).toBeTruthy(); // VersionPreviewUnavailable, not notFound
  });

  it("renders the historical version for the owner", async () => {
    previewMock.mockResolvedValue({ ok: true, snapshot });
    const element = await VersionPreviewFramePage(params(PID, "2"));
    expect(element).toBeTruthy();
    expect(previewMock).toHaveBeenCalledWith("user_1", PID, 2);
  });
});
