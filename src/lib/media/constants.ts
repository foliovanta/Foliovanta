// Shared media constants. Raster images only for the MVP — no SVG (active
// content / script risk) and no video.

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Reject truncated/empty uploads and oversized files.
export const MIN_UPLOAD_BYTES = 64;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// Decompression-bomb guard: a plausible maximum edge length for a portfolio
// image, and a hard total-pixel cap passed to the decoder.
export const MAX_IMAGE_DIMENSION = 6000;
export const MAX_IMAGE_PIXELS = 24_000_000; // ~24 MP

// Normalized delivery output: images are downscaled to fit this box (never
// enlarged) and re-encoded in their detected format with these qualities.
export const DELIVERY_MAX_DIMENSION = 2048;
export const OUTPUT_QUALITY = 82;

// Staging objects (raw browser upload) live under this prefix; the verified,
// normalized object is written to the asset's own storageKey. The verified key
// is never presigned to the client, so an untrusted upload cannot overwrite it.
export const STAGING_PREFIX = "staging/";

// Per-portfolio quota by purpose. One avatar; a bounded number of covers.
export const ASSET_QUOTA: Record<"PROFILE_AVATAR" | "PROJECT_COVER", number> = {
  PROFILE_AVATAR: 1,
  PROJECT_COVER: 24,
};

// Basic abuse guard on upload initiation: max new assets per portfolio per
// minute (counts all recent creations, so it can't be beaten by concurrency).
export const INITIATIONS_PER_MINUTE = 20;
