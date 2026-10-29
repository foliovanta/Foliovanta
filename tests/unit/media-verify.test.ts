// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { verifyAndNormalizeImage } from "@/lib/media/verify";

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 80, b: 120 } } })
    .png()
    .toBuffer();

const jpeg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();

describe("verifyAndNormalizeImage (real sharp)", () => {
  it("accepts a valid PNG and returns trusted metadata", async () => {
    const result = await verifyAndNormalizeImage(await png(400, 300));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.image.contentType).toBe("image/png");
      expect(result.image.width).toBe(400);
      expect(result.image.height).toBe(300);
      expect(result.image.byteSize).toBeGreaterThan(0);
    }
  });

  it("downscales an oversized-for-delivery image without enlarging", async () => {
    const result = await verifyAndNormalizeImage(await jpeg(3000, 2000));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.image.width).toBeLessThanOrEqual(2048);
      expect(result.image.height).toBeLessThanOrEqual(2048);
    }
  });

  it("rejects dimensions beyond the hard cap", async () => {
    const result = await verifyAndNormalizeImage(await png(6500, 100));
    expect(result).toEqual({ ok: false, reason: "DIMENSIONS_EXCEEDED" });
  });

  it("rejects non-image / spoofed bytes by magic number", async () => {
    const notAnImage = Buffer.from("this is definitely not an image, ".repeat(4));
    expect(await verifyAndNormalizeImage(notAnImage)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_TYPE",
    });
  });

  it("rejects a file with a valid JPEG header but corrupt body", async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200, 0x41)]);
    expect(await verifyAndNormalizeImage(fake)).toEqual({ ok: false, reason: "DECODE_FAILED" });
  });

  it("strips EXIF metadata during normalization", async () => {
    const withExif = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withExif({ IFD0: { Copyright: "Foliovanta" } })
      .jpeg()
      .toBuffer();
    // Sanity: the input carries EXIF.
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await verifyAndNormalizeImage(withExif);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((await sharp(Buffer.from(result.image.bytes)).metadata()).exif).toBeUndefined();
    }
  });
});
