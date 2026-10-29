// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/media/upload-service", () => ({
  initiateUpload: vi.fn(),
  completeUpload: vi.fn(),
}));
vi.mock("@/lib/media/attach-service", () => ({ attachMediaAsset: vi.fn() }));
vi.mock("@/lib/media/delivery", () => ({ resolveMediaAccess: vi.fn() }));
vi.mock("@/lib/media/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media/storage")>();
  return { ...actual, getStorageProvider: vi.fn() };
});

import { POST as initiate } from "@/app/api/portfolios/[portfolioId]/media/route";
import { POST as complete } from "@/app/api/portfolios/[portfolioId]/media/[assetId]/complete/route";
import { PATCH as attach } from "@/app/api/portfolios/[portfolioId]/media/attach/route";
import { GET as media } from "@/app/api/media/[assetId]/route";
import { completeUpload, initiateUpload } from "@/lib/media/upload-service";
import { attachMediaAsset } from "@/lib/media/attach-service";
import { resolveMediaAccess } from "@/lib/media/delivery";
import { StorageNotConfiguredError, getStorageProvider } from "@/lib/media/storage";

const authMock = vi.mocked(auth);
const PID = randomUUID();
const AID = randomUUID();
const post = (body: unknown) =>
  new Request("http://t", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const patch = (body: unknown) =>
  new Request("http://t", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({ userId: "user_1" } as never);
  vi.mocked(initiateUpload).mockReset();
  vi.mocked(completeUpload).mockReset();
  vi.mocked(attachMediaAsset).mockReset();
  vi.mocked(resolveMediaAccess).mockReset();
  vi.mocked(getStorageProvider).mockReset();
});

describe("POST media (initiate)", () => {
  const params = { params: Promise.resolve({ portfolioId: PID }) };

  it("401 unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    expect(
      (
        await initiate(
          post({ purpose: "PROFILE_AVATAR", contentType: "image/png", byteSize: 10 }),
          params,
        )
      ).status,
    ).toBe(401);
  });

  it("400 on invalid body", async () => {
    expect(
      (await initiate(post({ purpose: "LOGO", contentType: "image/png", byteSize: 10 }), params))
        .status,
    ).toBe(400);
  });

  it("201 with assetId + signed upload", async () => {
    vi.mocked(initiateUpload).mockResolvedValue({
      ok: true,
      assetId: AID,
      upload: { url: "https://signed", method: "PUT", headers: {}, expiresInSeconds: 120 },
    });
    const res = await initiate(
      post({ purpose: "PROFILE_AVATAR", contentType: "image/png", byteSize: 10 }),
      params,
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ data: { assetId: AID } });
  });

  it("maps quota → 409, rate-limit → 429, storage-unavailable → 503", async () => {
    vi.mocked(initiateUpload).mockResolvedValue({ ok: false, error: "QUOTA_EXCEEDED" });
    expect(
      (
        await initiate(
          post({ purpose: "PROJECT_COVER", contentType: "image/png", byteSize: 10 }),
          params,
        )
      ).status,
    ).toBe(409);
    vi.mocked(initiateUpload).mockResolvedValue({ ok: false, error: "RATE_LIMITED" });
    expect(
      (
        await initiate(
          post({ purpose: "PROJECT_COVER", contentType: "image/png", byteSize: 10 }),
          params,
        )
      ).status,
    ).toBe(429);
    vi.mocked(initiateUpload).mockRejectedValue(new StorageNotConfiguredError());
    expect(
      (
        await initiate(
          post({ purpose: "PROJECT_COVER", contentType: "image/png", byteSize: 10 }),
          params,
        )
      ).status,
    ).toBe(503);
  });
});

describe("POST media complete", () => {
  const params = { params: Promise.resolve({ portfolioId: PID, assetId: AID }) };

  it("200 on success", async () => {
    vi.mocked(completeUpload).mockResolvedValue({
      ok: true,
      status: "READY",
      width: 800,
      height: 600,
      contentType: "image/jpeg",
    });
    const res = await complete(post({}), params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ data: { status: "READY", width: 800 } });
  });

  it("422 on verification failure, 409 on missing upload, 404 not found", async () => {
    vi.mocked(completeUpload).mockResolvedValue({
      ok: false,
      error: { verification: "UNSUPPORTED_TYPE" },
    });
    expect((await complete(post({}), params)).status).toBe(422);
    vi.mocked(completeUpload).mockResolvedValue({ ok: false, error: "UPLOAD_MISSING" });
    expect((await complete(post({}), params)).status).toBe(409);
    vi.mocked(completeUpload).mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    expect((await complete(post({}), params)).status).toBe(404);
  });
});

describe("PATCH media attach", () => {
  const params = { params: Promise.resolve({ portfolioId: PID }) };

  it("200 on success", async () => {
    vi.mocked(attachMediaAsset).mockResolvedValue({
      ok: true,
      value: { assetId: AID },
      revision: BigInt(5),
    });
    const res = await attach(
      patch({ expectedRevision: "4", target: { kind: "avatar" }, assetId: AID }),
      params,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { assetId: AID, revision: "5" } });
  });

  it("409 conflict, 400 invalid asset", async () => {
    vi.mocked(attachMediaAsset).mockResolvedValue({ ok: false, error: "REVISION_CONFLICT" });
    expect(
      (
        await attach(
          patch({ expectedRevision: "1", target: { kind: "avatar" }, assetId: AID }),
          params,
        )
      ).status,
    ).toBe(409);
    vi.mocked(attachMediaAsset).mockResolvedValue({ ok: false, error: "INVALID_ASSET" });
    expect(
      (
        await attach(
          patch({ expectedRevision: "4", target: { kind: "avatar" }, assetId: AID }),
          params,
        )
      ).status,
    ).toBe(400);
  });

  it("detaches with assetId null", async () => {
    vi.mocked(attachMediaAsset).mockResolvedValue({
      ok: true,
      value: { assetId: null },
      revision: BigInt(6),
    });
    const res = await attach(
      patch({ expectedRevision: "5", target: { kind: "avatar" }, assetId: null }),
      params,
    );
    expect(res.status).toBe(200);
  });
});

describe("GET media (delivery proxy)", () => {
  const params = { params: Promise.resolve({ assetId: AID }) };

  it("404 when access is denied", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    vi.mocked(resolveMediaAccess).mockResolvedValue(null);
    expect((await media(new Request("http://t"), params)).status).toBe(404);
  });

  it("streams bytes with a public cache policy for a public asset", async () => {
    vi.mocked(resolveMediaAccess).mockResolvedValue({
      storageKey: "k",
      contentType: "image/jpeg",
      visibility: "public",
    });
    vi.mocked(getStorageProvider).mockReturnValue({
      name: "R2",
      getObjectBytes: async () => new Uint8Array([1, 2, 3]),
    } as never);
    const res = await media(new Request("http://t"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    // Conservative MVP: public assets are not cached, so revocation is immediate.
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("uses a private no-store policy for an owner-only asset", async () => {
    vi.mocked(resolveMediaAccess).mockResolvedValue({
      storageKey: "k",
      contentType: "image/png",
      visibility: "private",
    });
    vi.mocked(getStorageProvider).mockReturnValue({
      name: "R2",
      getObjectBytes: async () => new Uint8Array([1]),
    } as never);
    const res = await media(new Request("http://t"), params);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("503 when storage is unconfigured", async () => {
    vi.mocked(resolveMediaAccess).mockResolvedValue({
      storageKey: "k",
      contentType: "image/png",
      visibility: "public",
    });
    vi.mocked(getStorageProvider).mockImplementation(() => {
      throw new StorageNotConfiguredError();
    });
    expect((await media(new Request("http://t"), params)).status).toBe(503);
  });
});
