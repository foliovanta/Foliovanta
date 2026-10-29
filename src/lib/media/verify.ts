import "server-only";

import sharp, { type Sharp } from "sharp";

import {
  type AllowedImageType,
  DELIVERY_MAX_DIMENSION,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  OUTPUT_QUALITY,
} from "@/lib/media/constants";
import { detectImageType } from "@/lib/media/validation";

export type VerifiedImage = {
  bytes: Uint8Array;
  contentType: AllowedImageType;
  width: number;
  height: number;
  byteSize: number;
};

export type VerifyFailure =
  "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE" | "DIMENSIONS_EXCEEDED" | "DECODE_FAILED";

export type VerifyResult =
  { ok: true; image: VerifiedImage } | { ok: false; reason: VerifyFailure };

// Re-encode in the detected format (a controlled, known encoder path) so a
// polyglot can't survive, dropping all metadata (EXIF/GPS/etc).
function encode(pipeline: Sharp, type: AllowedImageType): Sharp {
  switch (type) {
    case "image/jpeg":
      return pipeline.jpeg({ quality: OUTPUT_QUALITY });
    case "image/png":
      return pipeline.png({ compressionLevel: 9 });
    case "image/webp":
      return pipeline.webp({ quality: OUTPUT_QUALITY });
  }
}

/**
 * Server-authoritative verification + normalization of uploaded bytes.
 *
 * Trusts nothing from the client: detects the real type from magic bytes, bounds
 * the decode with sharp's pixel limit (decompression-bomb guard), enforces
 * dimension caps, strips metadata by re-encoding, and downscales to the delivery
 * box. Returns the normalized bytes + trusted metadata; the caller stores that
 * output and only then marks the asset READY. Bounded memory/time: no streaming
 * of unbounded input (callers pass an already size-checked buffer), a fixed
 * input-pixel ceiling, and a single synchronous encode.
 */
export async function verifyAndNormalizeImage(input: Uint8Array): Promise<VerifyResult> {
  if (input.byteLength < MIN_UPLOAD_BYTES) return { ok: false, reason: "EMPTY" };
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: "TOO_LARGE" };

  const detected = detectImageType(input);
  if (!detected) return { ok: false, reason: "UNSUPPORTED_TYPE" };

  const buffer = Buffer.from(input);
  let pipeline: Sharp;
  try {
    pipeline = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" });
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) return { ok: false, reason: "DECODE_FAILED" };
    if (meta.width > MAX_IMAGE_DIMENSION || meta.height > MAX_IMAGE_DIMENSION) {
      return { ok: false, reason: "DIMENSIONS_EXCEEDED" };
    }
    if (meta.width * meta.height > MAX_IMAGE_PIXELS) {
      return { ok: false, reason: "DIMENSIONS_EXCEEDED" };
    }
  } catch {
    return { ok: false, reason: "DECODE_FAILED" };
  }

  try {
    // rotate() applies and then clears EXIF orientation; resize fits the delivery
    // box without enlarging; the format encoder drops remaining metadata.
    const normalized = encode(
      sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" }).rotate().resize({
        width: DELIVERY_MAX_DIMENSION,
        height: DELIVERY_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      }),
      detected,
    );
    const { data, info } = await normalized.toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      image: {
        bytes: new Uint8Array(data),
        contentType: detected,
        width: info.width,
        height: info.height,
        byteSize: info.size,
      },
    };
  } catch {
    return { ok: false, reason: "DECODE_FAILED" };
  }
}
