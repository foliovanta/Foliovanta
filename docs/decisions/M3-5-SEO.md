# M3.5 — Portfolio SEO, Metadata & Discoverability

Status: Implemented
Date: 2026-10-27

## Metadata source of truth
Public metadata is generated **server-side from the active published snapshot
only** — never from draft content. The public route resolves the snapshot via
`getPublicPortfolioByUserSlug` (same authorization + visibility gate as
rendering), then derives title, description, canonical, Open Graph, Twitter card,
and JSON-LD from whitelisted snapshot fields (displayName, headline, bio), with
length limits and whitespace normalization. Nothing is fabricated; no private
fields, draft data, or storage keys are exposed.

## Canonical URL rules
- Canonical origin is the configured `NEXT_PUBLIC_APP_URL` (validated), **never**
  the request `Host` header.
- Canonical path is always the CURRENT username: `/{publicSlug}/{username}`.
- A stale username 307-redirects to the canonical URL (publicly-visible only);
  the `<link rel="canonical">` gives search engines the dedup signal so renames
  never create duplicate indexed URLs.
- Legacy `/p/{slug}` 307-redirects to the canonical URL when public, else 404.

## Open Graph image
A colocated `opengraph-image` route (Next.js `ImageResponse`, Node runtime for
Prisma) renders a 1200×630 card from the published name + optional headline +
Foliovanta branding, with safe truncation and a text-only fallback for
unavailable/legacy snapshots. No external image service, no remote image URLs,
no private/draft data; profile imagery is intentionally not embedded (avoids
media-auth coupling). Next auto-wires `og:image` and `twitter:image`.

## Sitemap inclusion criteria
`sitemap.xml` lists only currently public portfolios (published, active version,
not soft-deleted, not moderation-suspended, owner ACTIVE) at their canonical
URL on the configured origin. The query selects identity + timestamps only — no
snapshot is loaded (no N+1). A single sitemap holds up to 50k URLs; beyond that,
split with Next's `generateSitemaps()` (one chunk per 50k, keyed by publishedAt
cursor). No draft/preview/legacy URLs.

## Robots behavior
`robots.txt` allows public pages and the authorized media proxy (`/api/media`,
for image indexing) and disallows `/dashboard`, `/editor`, `/preview`, `/admin`,
`/sign-in`, `/sign-up`, `/api/portfolios`, `/api/auth`, `/api/webhooks`,
`/api/internal`. This is crawler hygiene, **not** access control — auth
middleware + per-request authorization protect the data. Preview security
headers (no-store, noindex, frame-ancestors) are unchanged.

## SEO after unpublish / suspension
All metadata, OG image, sitemap inclusion, JSON-LD, and the page itself are
gated by the same live visibility check. On unpublish, moderation suspension,
account deactivation, or soft-delete: the page 404s with `noindex`, the OG image
returns the generic fallback, and the portfolio drops out of the sitemap. Media
delivery is `no-store`, so revocation is immediate (no cached public media).

## Unsupported-version policy
An unsupported snapshot schema version OR template version resolves to a uniform
`NOT_FOUND` (controlled 404 + noindex) — never a blank HTTP 200. Enforced in
`public-read` via `isTemplateVersionSupported` (pure, sourced from
`CURRENT_TEMPLATE_VERSION`), with a regression test.

## Production deployment requirements
- Set `NEXT_PUBLIC_APP_URL=https://foliovanta.com` (drives canonical, OG, sitemap,
  robots). Without it, URLs fall back to localhost.
- No new DB migration this milestone.

## Search Console setup
1. Add the `foliovanta.com` property and verify domain ownership (DNS TXT).
2. Submit `https://foliovanta.com/sitemap.xml`.
3. Validate rendered metadata with the Rich Results / URL Inspection tools and a
   social card validator (the OG image is server-rendered per portfolio).
