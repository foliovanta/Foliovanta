// The public reference templates use to display an asset. It points at the
// same-origin delivery proxy (which authorizes + streams the bytes) — never at a
// storage key or an owner-supplied URL. Stable across published versions.
export function publicAssetUrl(assetId: string): string {
  return `/api/media/${assetId}`;
}
