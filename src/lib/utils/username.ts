// URL usernames are the editable, human-readable second path segment
// (/{publicSlug}/{username}). They are NOT globally unique and are never an
// identity/authorization key — the numeric publicSlug identifies the user.

// Short enough to stay readable in a URL; long enough for most real names.
export const MAX_USERNAME_LENGTH = 39;

// Seed used when nothing normalizable is available. Non-unique by design.
export const DEFAULT_USERNAME = "portfolio";

/**
 * Canonicalize a username to a URL-safe, lowercase, hyphen-separated slug.
 * Returns "" when the input has no usable characters (caller decides fallback).
 */
export function normalizeUsername(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_USERNAME_LENGTH)
    .replace(/-+$/g, ""); // slice may leave a trailing hyphen
}

/**
 * First normalizable source wins; falls back to DEFAULT_USERNAME. Used to seed
 * an account's initial username from its display name / account name.
 */
export function deriveUsername(...sources: Array<string | null | undefined>): string {
  for (const source of sources) {
    if (!source) continue;
    const normalized = normalizeUsername(source);
    if (normalized) return normalized;
  }
  return DEFAULT_USERNAME;
}
