// Single source of truth for public portfolio URLs: /{publicSlug}/{username}.
// Always build URLs from the authoritative numeric publicSlug and the current
// username — never from the (now internal) portfolio slug or a Host header.
//
// Safe to import from both server and client modules: it only reads the public
// NEXT_PUBLIC_APP_URL (inlined at build time on the client).

const FALLBACK_ORIGIN = "http://localhost:3000";

/**
 * The origin for absolute public URLs. Environment-aware: production/preview set
 * NEXT_PUBLIC_APP_URL (e.g. https://foliovanta.com); local dev falls back to
 * localhost. An unparseable value falls back rather than emitting a broken URL.
 */
export function getPublicOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!raw) return FALLBACK_ORIGIN;
  try {
    // Validate shape; reject anything that isn't an absolute http(s) origin.
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return FALLBACK_ORIGIN;
    return raw;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

/** Canonical path. publicSlug is the decimal numeric id as a string. */
export function publicPortfolioPath(publicSlug: string, username: string): string {
  return `/${publicSlug}/${encodeURIComponent(username)}`;
}

/** Absolute canonical URL for SEO/metadata and copy-link. */
export function publicPortfolioUrl(publicSlug: string, username: string): string {
  return `${getPublicOrigin()}${publicPortfolioPath(publicSlug, username)}`;
}
