# M3 — Public URL Identity (numeric user slug + editable username)

Status: Approved (supersedes the prior subdomain-slug URL design)
Date: 2026-10-27

## Decision

Public portfolios are served at a **path-based** URL on the primary domain:

```
https://foliovanta.com/{publicSlug}/{userName}
```

Example: `https://foliovanta.com/10482/rishab-thakur`.

- **`publicSlug`** — system-generated numeric identity on the **User**. Globally
  unique, immutable, never reused, stable across username changes, never
  user-editable. It identifies the user.
- **`userName`** — human-readable, URL-safe, **editable** label on the **User**.
  Not globally unique (two users may share one). Presentation only — never an
  identity or authorization key.

This supersedes the previously documented host-based scheme
`<slug>.foliovanta.com` (PRD §public URLs, TRD §public URL design,
APP_FLOW, UI_UX_DESIGN_BRIEF) and the "slug immutable, on Portfolio" model.
Wildcard subdomains and custom domains remain out of scope.

## Why

- A numeric, immutable user identity gives a stable public address that survives
  display-name / username edits and never collides.
- A path-based URL avoids wildcard-subdomain DNS/cert/proxy complexity for the
  foreseeable roadmap while keeping SEO-friendly canonical URLs.
- Decoupling identity (numeric) from the human label (username) lets users
  rename freely without breaking links (stale usernames 308 → canonical).

## Data model

Added to `User`:

- `publicSlug BigInt @unique` — allocated by Postgres sequence
  `users_public_slug_seq` (START 10000) via a column `DEFAULT nextval(...)`:
  concurrency-safe, monotonic, never reused. A `BEFORE UPDATE` trigger
  (`users_public_slug_immutable`) rejects any change. Serialized as a **string**
  at API boundaries (BigInt).
- `username String @default("portfolio")` — URL-safe, editable, non-unique.
  Normalized by `normalizeUsername` (lowercase, ASCII alnum, single hyphens,
  trimmed, ≤39 chars).

`Portfolio.slug` is **retained but now internal** (still embedded in historical
snapshots; still unique). It is no longer part of any public URL. It remains a
candidate for future removal once nothing depends on it.

### Username seeding

- **New accounts:** seeded at Clerk-webhook user creation from the account name,
  falling back to the default. Never overwritten on later webhook updates.
- **Existing accounts (backfill):** seeded from the portfolio display name →
  account name → default, in the migration.
- `username` and `displayName` are **separate** fields — the username is only
  *seeded* from the display name, then independently editable.

## Routing

- New canonical route `/[publicSlug]/[username]` resolves identity **only by
  `publicSlug`** (never by username), applies the full visibility gate
  (published, not moderated-off, not soft-deleted, active version, active owner),
  and 308-redirects a stale username segment to the current canonical URL — only
  when the portfolio is publicly visible, else a uniform 404.
- Legacy `/p/[slug]` is kept as a **redirect-only** route: 308 → canonical when
  publicly visible, else uniform 404 (no existence leak).
- Numeric-first segment avoids collision with `/dashboard`, `/editor`, `/api`,
  auth routes (static segments take precedence; non-numeric first segments 404).

## Snapshots / publishing

- **No snapshot schema change** (`SNAPSHOT_SCHEMA_VERSION` stays 1). Public URL
  identity is resolved from **live User metadata**, not the snapshot. A username
  edit therefore never changes the content hash, never forces a republish, and
  all historical versions remain renderable. Publish idempotency/content-hash
  semantics are unchanged.

## Security

- Enumerating numeric publicSlugs reveals nothing non-public (same visibility
  gate; uniform 404).
- Username edits are owner-scoped; identity lookups never use the (non-unique)
  username, so a shared username cannot cause cross-user access.
- publicSlug is public and enumerable — never an authorization key; internal
  UUIDs remain the only primary/foreign keys.

## Superseded documentation

These statements describe the old scheme and are superseded by this decision;
propagate as needed: PRD.md (public URL / subdomain / slug-immutable lines),
TRD.md §public URL design + hostname rewrite, APP_FLOW.md public-portfolio rows,
BACKEND_SCHEMA.md User/Portfolio + slug uniqueness narrative,
UI_UX_DESIGN_BRIEF.md U01, IMPLEMENTATION_PLAN.md PUB-05/PUB-08.
