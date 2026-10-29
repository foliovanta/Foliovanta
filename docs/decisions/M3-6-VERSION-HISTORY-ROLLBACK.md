# M3.6 — Publishing Version History & Rollback

Status: implemented
Roadmap: PUB-04 (version history / rollback), PUB-09 (UI), PUB-10 (lifecycle verification), Gate G7 (partial)
Supersedes/extends: `M3-URL-IDENTITY.md`, publishing stack (`publish-service.ts`)

## Context

Publishing already produced immutable `PortfolioVersion` snapshots and moved a
single active-version pointer (`Portfolio.activeVersionId`, composite FK to
`PortfolioVersion(portfolioId, id)`). Version-history listing
(`listPortfolioVersions` + `GET /api/portfolios/[id]/versions`) and a read-only
history list in the publishing workspace existed. What was missing: the ability
to **preview a historical version** and to **roll the live page back** to one.

## Decisions

### 1. Rollback is a pointer move, nothing else

`rollbackPortfolio(clerkUserId, portfolioId, targetVersionNumber, expectedActiveVersionNumber)`
(`src/lib/publishing/publish-service.ts`) re-points `activeVersionId` at an
existing immutable version. It **never** rewrites, copies, or deletes a snapshot,
and **never** touches the draft (`draftRevision` and `nextVersionNumber` are left
unchanged, so unsaved editor work is preserved). It reuses the exact row-lock
pattern (`SELECT … FOR UPDATE`) that publish/unpublish take, so publish,
unpublish and rollback serialize cleanly on the same portfolio.

Guards, all inside the locked transaction:

- **Owner-scoped** via `resolveActiveUser` + the lock predicate; a cross-owner,
  deleted or nonexistent portfolio returns a uniform `NOT_FOUND`.
- **Moderation is never bypassed:** a `SUSPENDED` portfolio returns
  `PORTFOLIO_SUSPENDED`; account suspension is handled by `resolveActiveUser`.
- **Must currently be PUBLISHED** (`NOT_PUBLISHED` otherwise). This is the
  explicit product decision for *rollback-after-unpublish*: rollback only
  re-points a **live** portfolio. A private (draft/unpublished) portfolio has no
  live version to re-point, and rolling back must **not** silently republish it —
  the owner publishes first.
- **Target must exist for this portfolio** (`TARGET_NOT_FOUND`).
- **Target must be renderable** (`TARGET_UNRENDERABLE`), using the *same*
  validation the public read applies — parse the stored snapshot with
  `publishedSnapshotSchema` and check `isTemplateVersionSupported` against the
  snapshot's own `templateKey`/`templateVersion` (not a denormalised column).
  This is enforced **before** the pointer moves, so a rollback can never put a
  version live that the public page would then 404 as unrenderable.
- **Optimistic concurrency:** the caller passes the active version it believed
  was live; a concurrent publish/rollback that advanced the pointer yields
  `ROLLBACK_CONFLICT` and the client reloads. Rolling back to the already-active
  version is an **idempotent** success no-op (`changed: false`).

On success the portfolio stays `PUBLISHED`, `publishedAt` is set to now (the live
content changed at this time — consistent with how publish stamps it), and the
pointer now addresses the target version.

**Audit trail:** consistent with the existing architecture, which has no
dedicated audit-log table — `PortfolioVersion` rows plus `publishedAt` are the
record. Rollback updates `portfolio.publishedAt`; a separate immutable audit log
is deferred (out of scope, see PUB-03's "write audit + outbox").

**Media availability:** guaranteed by the existing retention policy — media
cleanup retains any asset referenced by a published version, so a version that
is still in history still has its media. No extra scan is performed; this relies
on that invariant.

### 2. Historical version preview (owner-only, immutable, private)

`buildVersionPreview(clerkUserId, portfolioId, versionNumber)`
(`src/lib/publishing/preview.ts`) reads a stored version's snapshot **read-only**
(no mutation, no republish) and applies the exact same validation as the public
read. An unsupported schema/template yields `UNRENDERABLE` — shown as an explicit
"can't preview" state, **never** silently substituted with the draft or active
version. A missing version or non-owner yields `NOT_FOUND`.

It renders through a new frame route
`/preview/[portfolioId]/version/[versionNumber]`, which sits under the existing
`/preview/*` surface and therefore inherits its headers: `Cache-Control: private,
no-store`, `X-Robots-Tag: noindex, nofollow`, and `Content-Security-Policy:
frame-ancestors 'self'`. Middleware already requires authentication for
`/preview`; the owner check is additionally enforced in the service.

### 3. UI (PUB-09)

The version-history section of the publishing workspace
(`publish-panel.tsx`) now shows, per version: a **Live** indicator (derived from
the authoritative active version number from publish-status, so it is correct
page-independently and immediately after a rollback), an owner-only **Preview**
link opening the historical frame in a new tab, and — on non-active versions,
only when the portfolio is published and not suspended — a **Roll back** action
behind an explicit inline confirmation ("Make this version live"). States
covered: loading (hidden until there is history), empty (hidden), error,
in-flight ("Restoring…"), conflict (reloads + message), and unrenderable. The UI
sends the current active version as the expected value for optimistic
concurrency, and refreshes both the parent status and the list on success so the
Live indicator and the "unpublished changes" badge update honestly.

## Public/SEO consistency

Rollback changes **only** the active pointer, and the public page, `generateMetadata`,
`opengraph-image`, Person/ProfilePage JSON-LD, and the sitemap source all read
the active-version snapshot (or the shared visibility predicate). So a rollback
immediately changes all of them, with no extra code, while every historical
snapshot remains immutable and `no-store` keeps revocation immediate. This is
verified at the service + public-read layer by the integration suite.

## Verification

- Typecheck ✓, ESLint ✓, production build ✓ (`/api/portfolios/[id]/rollback` and
  `/preview/[id]/version/[versionNumber]` registered).
- Unit: 353 passed — rollback route error mapping, version-preview frame
  (noindex/404/owner/unrenderable/render), and publish-panel rollback flow
  (confirm, expected-active value, conflict).
- DB integration (`foliovanta_dev`, opt-in): rollback suite 10/10 — pointer move
  + public-read change, idempotency, optimistic-concurrency conflict, concurrent
  publish↔rollback serialization, unpublished/suspended/cross-owner/
  unrenderable guards, and owner-only historical preview with unsupported-version
  handling.

## Not verified / out of scope

- Warmed-cache revocation and real-TLS/host checks (no CDN/live host available)
  remain outstanding for **Gate G7**.
- No admin moderation UI, analytics, notifications, custom domains, new
  templates, media gallery, audit-log table, or editor redesign (explicitly out
  of scope for M3.6).
