export function normalizePortfolioSlug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Matches the proposed public hostname length bound in BACKEND_SCHEMA.md \u00a75.1.
export const MAX_PORTFOLIO_SLUG_LENGTH = 63;

// Reserved subdomains/paths that must never be allocated as a portfolio slug.
const RESERVED_PORTFOLIO_SLUGS = new Set([
  "about",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "blog",
  "dashboard",
  "foliovanta",
  "help",
  "login",
  "logout",
  "mail",
  "public",
  "settings",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "static",
  "status",
  "support",
  "www",
]);

export function isReservedPortfolioSlug(slug: string): boolean {
  return RESERVED_PORTFOLIO_SLUGS.has(slug);
}
