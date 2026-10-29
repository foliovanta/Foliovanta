// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { MAX_UPLOAD_BYTES } from "@/lib/media/constants";
import { createR2Provider, type R2Deps } from "@/lib/media/r2-storage";

const ENV = { accountId: "acc", accessKeyId: "id", secretAccessKey: "secret", bucket: "bucket" };

function provider(overrides: Partial<R2Deps> = {}) {
  const send = vi.fn();
  const sign = vi.fn().mockResolvedValue("https://r2.example/signed");
  return { p: createR2Provider(ENV, { send, sign, ...overrides }), send, sign };
}

// The AWS command objects expose their params as `.input`.
const input = (command: unknown) => (command as { input: Record<string, unknown> }).input;

describe("R2 storage adapter", () => {
  it("signs a size- and type-bound PUT and never returns the client secret", async () => {
    const { p, sign } = provider();
    const result = await p.createSignedUpload({
      key: "staging/assets/x.jpg",
      contentType: "image/jpeg",
      maxBytes: 1000,
    });
    expect(result).toMatchObject({
      url: "https://r2.example/signed",
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(result.expiresInSeconds).toBeGreaterThan(0);
    expect(input(sign.mock.calls[0]![0])).toMatchObject({
      Bucket: "bucket",
      Key: "staging/assets/x.jpg",
      ContentType: "image/jpeg",
      ContentLength: 1000,
    });
  });

  it("maps headObject and returns null for a missing object", async () => {
    const present = provider();
    present.send.mockResolvedValue({ ContentLength: 2048, ContentType: "image/png" });
    expect(await present.p.headObject("k")).toEqual({ byteSize: 2048, contentType: "image/png" });

    const missing = provider();
    missing.send.mockRejectedValue(Object.assign(new Error("x"), { name: "NotFound" }));
    expect(await missing.p.headObject("k")).toBeNull();
  });

  it("returns object bytes and rejects an object over the size ceiling", async () => {
    const small = provider();
    const data = new Uint8Array([1, 2, 3]);
    small.send.mockResolvedValue({ Body: { transformToByteArray: async () => data } });
    expect(await small.p.getObjectBytes("k")).toEqual(data);

    const huge = provider();
    huge.send.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array(MAX_UPLOAD_BYTES + 1) },
    });
    await expect(huge.p.getObjectBytes("k")).rejects.toThrow(/maximum allowed size/);
  });

  it("writes and deletes objects via the client", async () => {
    const { p, send } = provider();
    send.mockResolvedValue({});
    await p.putObject({ key: "verified/x", body: new Uint8Array([9]), contentType: "image/webp" });
    expect(input(send.mock.calls.at(-1)![0])).toMatchObject({
      Bucket: "bucket",
      Key: "verified/x",
      ContentType: "image/webp",
    });
    await p.deleteObject("verified/x");
    expect(input(send.mock.calls.at(-1)![0])).toMatchObject({
      Bucket: "bucket",
      Key: "verified/x",
    });
  });
});
