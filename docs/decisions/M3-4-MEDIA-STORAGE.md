# M3.4 — Media Storage Architecture (Step 1 foundation)

Status: Step 1 implemented (schema + contracts + helpers + tests). No cloud
operations; no credentials; no upload UI.
Date: 2026-10-27

## 1. Provider recommendation — Cloudflare R2

| Criterion | R2 | AWS S3 | Vercel Blob |
|---|---|---|---|
| Vercel compatibility | ✓ (HTTPS API) | ✓ | ✓ native |
| Direct browser upload | ✓ presigned PUT (S3 API) | ✓ presigned PUT | ✓ |
| Private + public assets | ✓ private bucket + signed/public delivery | ✓ | ~ (simpler, less control) |
| CDN delivery | ✓ Cloudflare CDN / custom domain | needs CloudFront | ✓ built-in |
| **Egress cost** | **$0 egress** | $ per GB | $ per GB |
| Vendor lock-in | low (S3-compatible API) | low | higher (proprietary) |
| Lifecycle cleanup | ✓ API + lifecycle rules | ✓ | ~ |
| Local dev | S3-compatible mock (MinIO / LocalStack) | same | hard to self-host |

**Recommendation: Cloudflare R2, accessed through its S3-compatible API.** For a
public portfolio site that serves images to the open web, **zero egress** is the
decisive cost factor, and the S3-compatible API means the same adapter targets
AWS S3 by config alone (migration safety). We use the official AWS SDK
(`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) against R2's endpoint —
added in Step 2, not now.

**Image transformation:** R2 has no built-in transforms. MVP strategy: verify +
**normalize server-side at upload** (re-encode, strip metadata, cap dimensions)
with `sharp`, store one processed derivative; defer responsive/multi-size
variants (Cloudflare Images or on-demand resizing) to later.

## 2. Asset data model (implemented)

`MediaAsset` (`media_assets`): `id` (UUID PK), `ownerId`→User (Restrict),
`portfolioId`→Portfolio (Restrict), `purpose` (PROFILE_AVATAR | PROJECT_COVER),
`status` (PENDING | READY | FAILED | DELETING), `provider` (R2), `storageKey`
(unique, opaque, server-generated), `contentType`/`byteSize`/`width`/`height`
(verified, null until READY), `createdAt`/`updatedAt`/`readyAt`/`deletedAt`.
Indexes on `ownerId`, `(portfolioId,status)`, `status`.

Draft content references an asset by UUID via the **existing**
`PortfolioProfile.avatarAssetId` / `Project.coverAssetId` columns (kept as soft
references — no new FK — so asset cleanup and draft concurrency stay decoupled;
validity of an attached id is enforced in the attach flow). Published snapshots
already carry those ids (`z.uuid().nullable()`), so **no snapshot schema change**.

## 3. Upload lifecycle state machine

```
initiate → PENDING ──server verifies bytes──▶ READY ──replaced/removed──▶ DELETING → (row removed)
                   └─ verification fails/abandoned ─▶ FAILED ─▶ DELETING
```

Steps: (1) authenticated initiation → (2) owner + quota check → (3) short-lived
signed PUT → (4) direct browser upload → (5) server HEAD + GET verifies bytes →
(6) magic-byte + dimension checks → (7) normalize/strip metadata → (8) READY with
verified metadata → (9) attach to draft → (10) publish embeds the id → (11)
cleanup of abandoned PENDING / unreferenced assets. **An asset becomes READY only
after server verification — never because the browser reported success.** Retries
and concurrent transitions are safe: a transition to the current state is an
idempotent no-op, and the state change is a status-guarded conditional update
(losers get CONFLICT). Concurrent initiation is serialized per portfolio by an
advisory lock so the quota can't be beaten by a race.

## 4. Security boundaries

- **Tenancy:** every asset op resolves the ACTIVE user and scopes by `ownerId`;
  a non-owner gets a uniform NOT_FOUND. Portfolio ownership is checked on
  initiation.
- **Key guessing:** `storageKey` is a server-generated random-UUID path, never
  derived from user input; never exposed where not needed.
- **Malicious content / MIME spoofing:** raster-only allowlist (JPEG/PNG/WebP);
  **no SVG**; the real type is detected from magic bytes (`detectImageType`) and
  must match — the browser's Content-Type is not trusted. Normalization
  re-encodes the image (defuses polyglots) and strips EXIF/GPS metadata.
- **Oversized / decompression bombs:** byte-size bounds (≤10 MB) at initiation;
  decoded-dimension cap (≤6000 px) at verification.
- **Signed URLs:** short expiry, single object key, size-bounded; originals kept
  private.
- **Quotas & rate limiting:** per-portfolio per-purpose quota enforced
  transactionally (rate limiting on the initiation endpoint is a Step 2 concern).
- **Public/private boundary:** originals private; only a processed derivative is
  publicly deliverable, and only once the owning portfolio is published (draft
  assets are not publicly reachable — see §5).

## 5. Snapshot & publishing compatibility

- Snapshots keep referencing assets by **UUID** (unchanged schema). Replacing a
  draft image attaches a new asset id to the draft; the already-published version
  keeps its own id and stays valid — immutability preserved.
- **Public rendering** resolves `assetId → delivery URL` server-side from the
  trusted `MediaAsset.storageKey` (never an owner-editable URL). A missing/deleted
  asset falls back (monogram / no cover).
- **Delivery visibility (Step 2):** draft/preview assets are served via
  short-lived signed URLs inside the authenticated preview only; on publish the
  processed derivative is promoted to public delivery. So an asset is publicly
  reachable only once a published version references it — draft assets never leak.
- **Cleanup** must refuse to hard-delete an asset still referenced by any
  published version (`isAssetReferencedByPublishedVersion`); such assets are
  retained until no version references them.

## 6. Required cloud setup (before Step 2)

1. Create a Cloudflare R2 bucket (private) for the environment.
2. Create an R2 API token (S3 credentials) scoped to that bucket.
3. Set env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET` (and later a public delivery base URL / custom domain). Never
   commit these.
4. Configure CORS on the bucket to allow presigned PUT from the app origin.
5. Local dev: point the same env at MinIO/LocalStack, or a scratch R2 bucket.

`getStorageProvider()` throws `StorageNotConfiguredError` until these exist, and
throws "implemented in Step 2" even when configured — nothing fake ships.

## 7. Recommended Step 2 plan

1. Add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; implement the R2
   `StorageProvider` adapter against the interface.
2. `POST /api/portfolios/[portfolioId]/media` → `createPendingAsset` + signed PUT.
3. `POST .../media/[assetId]/complete` → HEAD/GET, magic-byte + dimension verify,
   normalize with `sharp` (strip metadata, cap size), store derivative, → READY.
4. Attach/detach endpoints that set `avatarAssetId`/`coverAssetId` via
   `mutateDraft` (optimistic concurrency); only READY, owned assets may attach.
5. Public + preview asset URL resolution (promote-on-publish; signed draft URLs).
6. Cleanup job: abandoned PENDING (age) and DELETING assets; skip published-
   referenced assets.
7. Rate limiting on initiation; the upload UI and cropping (later milestone).

---

## Step 2.5 — Hardening & revocation policy

### Cache / revocation guarantee (MVP)
Media is delivered only through the authenticated proxy (`/api/media/[assetId]`),
which authorizes every request against the **current active published snapshot**
(or owner identity for drafts). MVP delivery responses are **`no-store`** for both
public and private visibility. Guarantee: **revocation is immediate** — after
unpublish, moderation suspension, or account deactivation, the very next request
is re-authorized and 404s; nothing is served from a browser or CDN cache. The
cost is a per-request origin fetch. A bounded-staleness public cache (short
max-age + explicit purge on revocation) is deferred until the public delivery
path is verified against real storage/CDN, to avoid claiming a revocation
guarantee a cache could violate.

### Cleanup safety
- Objects are deleted **before** the DB row, and the row is dropped **only if
  both object deletes succeed** (S3/R2 delete is idempotent, so a thrown error is
  a real failure); on failure the row is retained for a later run — no orphaned
  storage and no orphaned rows.
- Reclaims abandoned PENDING (>1h grace), FAILED, DELETING; never deletes an
  asset referenced by any retained published version.
- **Deferred:** reference-safe cleanup of *detached READY* assets (attached to no
  current draft and no retained version). Doing it safely requires checking draft
  (profile/project) references + all retained-version references **and** closing
  the TOCTOU window against a concurrent attach — which needs a grace period plus
  an attach lease or a DELETING-first handshake (a schema/locking change). It is
  documented and deferred rather than implemented riskily.

### Concurrency analysis (confirmed safe)
- The verified key is written only by the server and never presigned, so an
  untrusted upload cannot overwrite a READY object.
- Concurrent completions read the **same** staging bytes → deterministic
  verification → a mixed FAILED/READY outcome is impossible; the status-guarded
  READY/FAILED flip yields exactly one winner. Worst case is a duplicate
  normalize+PUT of equivalent bytes (wasteful, not unsafe).
- A DB failure after the verified PUT leaves a reclaimable PENDING with staging
  intact, so a completion retry recovers.

### SDK robustness
The R2 client sets `maxAttempts: 3` and `requestHandler` connection/request
timeouts (5s/20s) so a hung socket cannot block the request path.
