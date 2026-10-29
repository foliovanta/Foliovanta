import { describe, expect, it } from "vitest";

import { MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES, MIN_UPLOAD_BYTES } from "@/lib/media/constants";
import {
  buildStorageKey,
  detectImageType,
  isAllowedImageType,
  isValidDimension,
  isValidUploadSize,
} from "@/lib/media/validation";

describe("isAllowedImageType", () => {
  it("allows only JPEG, PNG and WebP", () => {
    expect(isAllowedImageType("image/jpeg")).toBe(true);
    expect(isAllowedImageType("image/png")).toBe(true);
    expect(isAllowedImageType("image/webp")).toBe(true);
    expect(isAllowedImageType("image/svg+xml")).toBe(false);
    expect(isAllowedImageType("image/gif")).toBe(false);
    expect(isAllowedImageType(null)).toBe(false);
  });
});

describe("isValidUploadSize", () => {
  it("enforces the size bounds", () => {
    expect(isValidUploadSize(MIN_UPLOAD_BYTES)).toBe(true);
    expect(isValidUploadSize(MAX_UPLOAD_BYTES)).toBe(true);
    expect(isValidUploadSize(MIN_UPLOAD_BYTES - 1)).toBe(false);
    expect(isValidUploadSize(MAX_UPLOAD_BYTES + 1)).toBe(false);
    expect(isValidUploadSize(1.5)).toBe(false);
  });
});

describe("isValidDimension", () => {
  it("rejects zero and decompression-bomb sizes", () => {
    expect(isValidDimension(1200, 800)).toBe(true);
    expect(isValidDimension(0, 800)).toBe(false);
    expect(isValidDimension(MAX_IMAGE_DIMENSION + 1, 800)).toBe(false);
  });
});

describe("detectImageType", () => {
  const bytes = (...b: number[]) => Uint8Array.from(b);

  it("identifies raster images by magic number", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0x00))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      "image/png",
    );
    const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
    expect(detectImageType(webp)).toBe("image/webp");
  });

  it("rejects non-raster / spoofed content (SVG, text, gif)", () => {
    expect(detectImageType(bytes(0x3c, 0x73, 0x76, 0x67))).toBeNull(); // "<svg"
    expect(detectImageType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // "GIF8"
    expect(detectImageType(bytes(0x68, 0x69))).toBeNull(); // "hi"
    // RIFF without WEBP (e.g. a WAV) is not accepted.
    expect(
      detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45)),
    ).toBeNull();
  });
});

describe("buildStorageKey", () => {
  it("produces an opaque, unique, correctly-extensioned key", () => {
    const a = buildStorageKey("PROFILE_AVATAR", "image/jpeg");
    const b = buildStorageKey("PROFILE_AVATAR", "image/jpeg");
    expect(a).toMatch(/^assets\/profile_avatar\/[0-9a-f-]{36}\.jpg$/);
    expect(a).not.toBe(b); // unguessable + unique
    expect(buildStorageKey("PROJECT_COVER", "image/webp")).toMatch(
      /^assets\/project_cover\/[0-9a-f-]{36}\.webp$/,
    );
  });
});
