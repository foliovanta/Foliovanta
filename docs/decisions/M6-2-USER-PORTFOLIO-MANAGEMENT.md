# M6.2 — User & Portfolio Management (read-only)

Status: implemented (read-only directories + detail)
Roadmap: ADM-02 (directory/detail portion), ADM-05 (extended), ADM-06 (extended); Gate G8 **still open**
Builds on: `M6-1-ADMIN-RBAC.md` (permission matrix, authorization resolver, audit log, admin shell)

## Scope

Read-only admin directories and detail views for users and portfolios. **No**
account or portfolio mutations (no role management, suspension, deletion,
moderation, feedback, or reports) — those are M6.3+.

## Read-only access policy

- Every API route and every service enforces authorization independently via
  `requirePermission` (DB-authoritative, ACTIVE-only, role re-read each request).
  Services never trust the route, admin layout, middleware, or hidden navigation.
  `admin.users.read` and `admin.portfolios.read` (from the M6.1 matrix, both held
  by ADMIN and SUPER_ADMIN) gate the respective surfaces.
- Admins may inspect **any** owner's portfolio metadata (cross-owner oversight),
  but only through these explicitly authorized admin services — the owner-scoped
  user APIs and the owner-only `/preview` routes are never reused with admin
  credentials.
- No private draft content, snapshot JSON, or owner-only preview link is ever
  exposed. The only link offered is to the **public** canonical page, and only
  when the portfolio is genuinely publicly visible (see Eligibility).

## Privacy / redaction decisions

- **Email is never displayed or searchable** in M6.2. User DTOs carry only
  `hasEmail: boolean` (whether an address is on file), never the address. Display
  name falls back to `User {publicSlug}`, never to the email. Email display/search
  is deferred pending explicit privacy sign-off (see Audit policy below).
- User search accepts an exact user id (UUID), an exact `publicSlug` (digits), or
  a bounded (≤100 char), case-insensitive **display-name** contains — nothing else.
- Portfolio directory projections select scalar metadata + a minimal owner
  summary + `activeVersion.versionNumber` only. They never load draft sections or
  the published snapshot JSON (verified by an integration test).
- Clerk is never queried per row; the database is the sole listing source.

## Public eligibility (single source of truth)

`src/lib/publishing/visibility.ts` now holds the one public-visibility policy:
the `PUBLICLY_VISIBLE_PORTFOLIO_WHERE` / `PUBLICLY_VISIBLE_OWNER_WHERE` fragments
(used by the public read) and a pure `evaluatePublicVisibility()` (used by the
admin detail). `public-read.ts` was refactored to import the fragment, so the
admin eligibility summary can never drift from what the public page actually
serves — an integration test asserts they agree. PUBLISHED alone is never treated
as public; eligibility also requires not-deleted, not-SUSPENDED, an active
version, and an ACTIVE owner.

## API contracts & DTOs

All responses are `{ data }` (or `{ error: { code, message } }`), `no-store`,
with an `x-correlation-id` header.

- `GET /api/admin/users?role=&status=&q=&limit=&cursor=` → `CursorPage<AdminUserListItem>`
- `GET /api/admin/users/{userId}` → `AdminUserDetail` (adds deletion state +
  up to 50 portfolio refs)
- `GET /api/admin/portfolios?publicationStatus=&moderationStatus=&q=&sort=&limit=&cursor=`
  → `CursorPage<AdminPortfolioListItem>` (`sort` ∈ createdAt|updatedAt)
- `GET /api/admin/portfolios/{portfolioId}` → `AdminPortfolioDetail` (adds
  `lastDraftSavedAt`, `deletedAt`, `visibilityReasons`)

DTO shapes are defined in `src/lib/admin/users-directory.ts` and
`portfolios-directory.ts`. Errors: `400 INVALID_REQUEST` (bad query/cursor),
`401 UNAUTHENTICATED`, `403 FORBIDDEN` (uniform, reason audited not disclosed),
`404 NOT_FOUND`, `429 RATE_LIMITED` (with `Retry-After`).

## Pagination contract

Keyset (not OFFSET) via the extended `src/lib/admin/pagination.ts`:

- Opaque base64url `{ v, id }` cursor; `v` = ISO timestamp of the sort field,
  `id` = unique UUID tie-breaker. `decodeCursor` validates both and returns null
  for anything tampered (invalid date, non-UUID id, injected keys dropped), so a
  cursor can never smuggle a predicate into the query → 400.
- Ordering is always `[sortField desc, id desc]`, a total order even when
  timestamps collide. Max page size 100 (default 25).
- Filters/search bind into the same `where` as the keyset condition, so paging is
  consistent with the active filter set. The UI remounts the list on filter
  change so page state resets cleanly.
- **Concurrency semantics (documented):** keyset paging is *not* snapshot-isolated.
  Rows inserted/updated between page fetches can appear or shift position; the id
  tie-breaker guarantees no duplicate or skipped row *for data unchanged across
  the two fetches*, but a row edited to move across the cursor boundary may be
  seen twice or missed. No snapshot consistency is promised. No unbounded `COUNT`
  is issued (there is no total-count UI).

## Rate-limiting architecture

`src/lib/admin/rate-limit.ts`: an injectable `RateLimiter` over a `RateLimitStore`
interface, enforced server-side on every admin directory/detail route, keyed by
the admin's Clerk id (IP fallback for anonymous), 120 req/min, `429` + `Retry-After`.

- **Production readiness is explicitly BLOCKED.** The only store implemented is
  `InMemoryRateLimitStore`, which is **per-instance** and therefore not a real
  cross-Vercel-instance control. `isRateLimitProductionReady()` returns `false`
  until a shared store (e.g. Upstash Redis) implements `RateLimitStore` and is
  wired in. This is a documented dependency, not a silently-complete control.
- **Fail-open decision (explicit):** on a limiter *store error* these read-only
  endpoints fail **open** (allow + warn) — availability of admin read access is
  preferred over hard-failing on a limiter outage. This never applies to a
  successful over-limit result (always enforced) and must be revisited before any
  admin **mutation** endpoint.

## Audit retention & access policy — PROPOSED (for review, not enforced)

Finalized proposal; no destructive retention is enforced by this milestone.

- **Who may read:** audit logs are readable only via `admin.audit.read`
  (SUPER_ADMIN only). No audit-reading UI ships in M6.2.
- **Retention & legal (OPEN):** proposed default retention **24 months**, then
  archival; final period and any statutory hold are an open legal decision.
  Records are immutable (DB trigger) and are not deleted by ordinary operations.
- **Metadata minimization:** only safe structured context is stored; sensitive
  keys are redacted at write (`sanitizeMetadata`), long strings capped. Directory
  reads add no new audit rows (only denied *attempts* are audited, by the routes).
- **Redaction:** credentials, tokens, session data, raw bodies, and email
  addresses must never enter audit metadata.
- **Deletion & export:** `actorUserId` is a bare UUID retained after account
  deletion (the record is a permanent fact). A subject-erasure/export workflow
  that reconciles this with privacy law is an **open** item requiring sign-off
  before launch; it must be a separate, privileged, audited process.

## Verification

Typecheck ✓, lint ✓, build ✓ (10 admin routes registered). Unit **417 passed**
(incl. cursor-tamper, rate-limit fail-open, visibility, route guards). Integration
**146 passed + 2 skipped** (directory authz, redaction, filters, search,
deterministic keyset pagination, eligibility↔public-read parity, no-snapshot-leak,
cross-owner, mid-session revocation) — full run green with no flake.

## Out of scope / remaining risks

- Rate limiting is **not production-ready** (no shared store) — see above.
- No admin snapshot preview (owner-only `/preview` is deliberately not reused);
  an admin-authorized published-snapshot preview needs its own boundary (future).
- Name/title search is a bounded `ILIKE` scan (no trigram index yet); fine at
  current scale, revisit with `pg_trgm` if directories grow large.
- Gate G8 remains **open**: moderation, feedback, reports, and audit-reading
  screens plus their mutations are future (M6.3+).
