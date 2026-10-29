import { randomUUID } from "node:crypto";

import {
  ALLOWED_IMAGE_TYPES,
  type AllowedImageType,
  EXTENSION_BY_TYPE,
  MAX_IMAGE_DIMENSION,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  STAGING_PREFIX,
} from "@/lib/media/constants";

export function isAllowedImageType(type: string | null | undefined): type is AllowedImageType {
  return typeof type === "string" && (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function isValidUploadSize(byteSize: number): boolean {
  return Number.isInteger(byteSize) && byteSize >= MIN_UPLOAD_BYTES && byteSize <= MAX_UPLOAD_BYTES;
}

export function isValidDimension(width: number, height: number): boolean {
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_IMAGE_DIMENSION;
  return ok(width) && ok(height);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Detects the real image type from the leading bytes (magic numbers), so an
 * upload can be verified against its claimed Content-Type rather than trusting
 * the client. Returns null for anything that isn't an allowed raster image —
 * including SVG/HTML/scripts, which never match a raster signature.
 */
export function detectImageType(bytes: Uint8Array): AllowedImageType | null {
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

// Opaque, unguessable, server-generated object key. A random UUID (122 bits)
// keeps it unguessable even if asset ids leak; the purpose is a readable prefix.
// Never derived from a user-supplied value.
export function buildStorageKey(purpose: string, contentType: AllowedImageType): string {
  const segment = purpose.toLowerCase().replace(/[^a-z0-9_]+/g, "");
  return `assets/${segment}/${randomUUID()}.${EXTENSION_BY_TYPE[contentType]}`;
}

// The raw browser upload lands here; the verified/normalized object is written
// to the (never-presigned) verified key. Deterministic so completion can find it.
export function stagingKeyFor(storageKey: string): string {
  return `${STAGING_PREFIX}${storageKey}`;
}
