# M2 Step 1 — Publishing Architecture & Immutable Snapshot Contract

> Design + pure implementation only. No publish endpoint, public page, subdomain
> routing, template renderer, or publishing UI in this step.

## 1. Architecture decisions

- **Pure, deterministic snapshot builder** (`src/lib/publishing/snapshot.ts`):
  a framework-free transform `PortfolioDraftInput → PublishedSnapshot`. No DB,
  auth, React/Next, `Date.now`, randomness, or input mutation. Validated with the
  project's Zod conventions; throws a clear `ZodError` on invalid draft data.
- **Publish-readiness is separate** (`src/lib/publishing/publish-readiness.ts`):
  decides whether a draft may publish and returns structured, field-addressable
  issues (never throws). Transformation and gating are intentionally decoupled.
- **No DB loader yet.** The loader that assembles `PortfolioDraftInput` from the
  owner-scoped draft tables is deferred to Step 2 (where the transaction lives).
  This keeps Step 1 fully pure and unit-testable. `PortfolioDraftInput` is the
  contract that loader must satisfy.
- **Snapshot schema version = 1** (`SNAPSHOT_SCHEMA_VERSION`), stored on every
  snapshot for future migrations; renderers must declare supported versions.

## 2. Published snapshot schema (`publishedSnapshotSchema`)

```
{
  schemaVersion: 1,
  portfolio: { slug, templateKey, templateVersion, theme },
  profile:   { displayName, headline, bio, location, avatarAssetId, emailPublic },
  sections:  [{ key, position, isVisible, layoutVariant }],
  projects:    [{ title, summary, description, projectUrl, repositoryUrl, coverAssetId, isFeatured, position }],
  experience:  [{ organization, roleTitle, location, startDate, endDate, isCurrent, description, position }],
  education:   [{ institution, degree, fieldOfStudy, startDate, endDate, description, position }],
  skills:      [{ name, category, proficiency, position }]
}
```

- Canonical DB field names. Dates are normalized to `YYYY-MM-DD` strings via UTC
  slicing (no timezone drift). Positions are renumbered densely (0-based) in
  deterministic order.
- URLs must be `http(s)`; `emailPublic` must be a valid email or null; `slug`
  must match the canonical pattern — enforced at the schema boundary.

## 3. Public / private field policy

- **Included (public):** slug, templateKey/version, theme, and the profile fields
  `displayName`, `headline`, `bio`, `location`, `avatarAssetId`, `emailPublic`
  (the opt-in public email), plus all project/experience/education/skill content
  and per-section metadata, and asset references (`avatarAssetId`,
  `coverAssetId`).
- **Excluded (never published):** row primary-key ids, `portfolioId`, `ownerId`,
  Clerk identity, the account email/name, `createdAt`/`updatedAt`, `draftRevision`,
  moderation/publication internals, and `PortfolioSection.config` (see §4).
- Nothing is published merely because it exists in a draft row; the snapshot type
  lists fields explicitly and is a `strictObject`, so stray fields cannot leak.

## 4. Section fallback & ordering rules

- The 8-key registry is merged with lazily persisted `PortfolioSection` rows.
- A persisted row supplies `isVisible`, `position`, `layoutVariant`. An
  unpersisted section defaults to **visible** at its registry index (matching the
  editor). **No section rows at all → all 8 visible in registry order.**
- Final order = sort by `(position, registryIndex)`, then renumber positions
  densely. Unknown/unsupported section keys in input are **dropped**.
- `layoutVariant` (a bounded string hint) is published; **`config` is not** — it
  has no validated public schema yet, so publishing it could expose unsafe data.
  It can be added in a later snapshot schema version once a registry exists.
- Sections without a content editor (ABOUT, CERTIFICATIONS, CONTACT) carry only
  metadata; no content is fabricated for them. Templates decide how to render
  (e.g. ABOUT from `profile.bio`, CONTACT from `profile.emailPublic`).

## 5. Publish-readiness rules (only documented requirements)

- **Slug:** canonical format, within length, not reserved.
- **Template:** a supported registry key (`minimal`/`professional`/`creative`;
  null defaults to `minimal`).
- **Profile:** non-empty `displayName` (BACKEND_SCHEMA §3.3 — publishing requires
  a display name). This is the only required content field.
- **URLs:** project/repository URLs must be `http(s)` when present.
- **Dates:** experience/education `endDate >= startDate`; a current role cannot
  have an end date (mirrors DB CHECKs).
- **No invented requirements:** no mandatory projects, skills, social links, or
  certifications; no mandatory sections (template-driven, deferred).

## 6. Prisma schema gaps (must be resolved in Step 2, with migration)

The control fields exist on `Portfolio` (`publicationStatus`, `moderationStatus`,
`nextVersionNumber`, `draftRevision`), but these do **not** exist yet:

- **`PortfolioVersion`** model (immutable: `id`, `portfolioId`, `versionNumber`,
  `sourceDraftRevision`, `schemaVersion`, `templateId`, `templateVersion`,
  `snapshot JSONB`, `contentHash`, `publishedById`, `createdAt`; unique
  `(portfolioId, versionNumber)` and `(portfolioId, id)`).
- **Active-version pointer** on `Portfolio` (e.g. `activeVersionId` with a
  composite FK `(id, activeVersionId) → PortfolioVersion(portfolioId, id)`).
- **`PortfolioDesign`/`PortfolioSettings`** (templateKey/version/theme, SEO) —
  until then the snapshot defaults `templateKey=minimal`, `templateVersion=1.0.0`,
  `theme={}`, and omits SEO.

Adding these is the approved deficiency for Step 2; no migration is made here.

## 7. Exact transaction plan for Step 2 (publish service)

In a single `prisma.$transaction` (reusing the `mutateDraft` conventions):

1. Resolve the Clerk user server-side; require `status = ACTIVE`.
2. Load the portfolio owner-scoped and `deletedAt IS NULL`; else `404 NOT_FOUND`.
3. If `moderationStatus = SUSPENDED`, refuse to publish.
4. Conditionally match `expectedRevision` against `draftRevision` **without
   bumping it** (publishing reads the draft; it must not change draft content
   revision). A mismatch → `409 REVISION_CONFLICT`.
5. Load a consistent draft snapshot input within the transaction.
6. `evaluatePublishReadiness(input)`; if not ok → `422` with issues (no writes).
7. `buildSnapshot(input)` → validated snapshot; compute a `contentHash`.
8. Atomically allocate the version number: read+increment `nextVersionNumber`
   (or `INSERT ... versionNumber = nextVersionNumber` guarded by the unique
   `(portfolioId, versionNumber)` constraint) inside the transaction.
9. `INSERT PortfolioVersion` with the snapshot, `sourceDraftRevision = draftRevision`,
   `schemaVersion`, `templateId/Version`, `contentHash`, `publishedById`.
10. Set `Portfolio.activeVersionId`, `publicationStatus = PUBLISHED`, `publishedAt`,
    bump `nextVersionNumber`.
11. Commit — readers only ever see a fully committed active version.

Guarantees this plan must preserve:

- Publishing **does not** change `draftRevision`.
- A **failed** publish (readiness/validation/conflict) consumes **no** version
  number (allocation happens only after validation, inside the transaction, and
  rolls back on failure).
- Two concurrent publishes cannot create duplicate version numbers — the unique
  `(portfolioId, versionNumber)` constraint + transaction serialization make one
  of them conflict/retry.
- Readers never observe a partial version (single-transaction activation).
- **Unpublish** flips `publicationStatus = UNPUBLISHED` / clears the active
  pointer but **never deletes** historical `PortfolioVersion` rows.
- **Moderation `SUSPENDED`** overrides publication for public visibility.

## 8. Remaining risks & deferred decisions

- `templateKey/version/theme` and SEO are placeholders until
  `PortfolioDesign`/`PortfolioSettings` exist (Step 2+).
- `config` publication deferred until a validated config registry exists.
- `contentHash` algorithm (stable canonical serialization) to be finalized in
  Step 2.
- Media/asset readiness (`avatarAssetId`, `coverAssetId`) is unvalidated — media
  isn't implemented; snapshots carry references only.
- Public read path, caching, suspension-aware visibility, and renderer version
  compatibility are later steps.
