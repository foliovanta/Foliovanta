// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publishing/public-read", () => ({ getPublicPortfolio: vi.fn() }));

import { GET } from "@/app/api/public/portfolios/[slug]/route";
import { getPublicPortfolio } from "@/lib/publishing/public-read";

const readMock = vi.mocked(getPublicPortfolio);
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("GET /api/public/portfolios/[slug]", () => {
  beforeEach(() => readMock.mockReset());

  it("returns the snapshot and version number for a published portfolio", async () => {
    const snapshot = { schemaVersion: 1, portfolio: { slug: "ada" } } as never;
    readMock.mockResolvedValue({ ok: true, snapshot, versionNumber: 3, publicSlug: "10482", username: "ada" });

    const res = await GET(new Request("http://t"), params("ada"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ data: { snapshot, versionNumber: 3 } });
    expect(readMock).toHaveBeenCalledWith("ada");
  });

  it("returns 404 (no-store) when not publicly visible", async () => {
    readMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await GET(new Request("http://t"), params("hidden"));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("returns 404 for an invalid slug (same shape — no existence leak)", async () => {
    readMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await GET(new Request("http://t"), params("!!!"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
