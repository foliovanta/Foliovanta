# M6.5.1 — Audit-Log Explorer

Status: implemented (pending browser acceptance)
Roadmap: completes the last ADM-02 admin interface requirement; extends ADM-05, ADM-06.
Builds on: M6-1 (audit log + append-only trigger + `admin.audit.read`), M6-2 (keyset pagination, directory patterns), M6-3/M6-4 (audit event taxonomy).

## Repository audit (Phase 0)

- **Schema/indexes:** `audit_logs` (`id`, `actorUserId?` bare UUID, `action`,
  `targetType?`, `targetId?`, `outcome`, `correlationId?`, `metadata? JSONB`,
  `createdAt`). Pre-existing indexes: `(actorUserId, createdAt)`, `(action,
  createdAt)`, `(targetType, targetId)`. **Added (M6.5.1):** `(createdAt, id)` for
  the newest-first keyset list and `(correlationId)` for correlation lookup.
- **Event taxonomy:** `admin.role.granted`; `moderation.{portfolio,account}.*`;
  `feedback.{review_started,resolved,closed}`; `report.{review_started,dismissed,actioned}`;
  denial events `admin.*.read.denied` / `*.triage.denied` / `moderation.*.denied`.
- **Access:** `admin.audit.read` exists, SUPER_ADMIN-only. No audit-read UI/API
  existed before this package.
- **Metadata risk:** writers already redact and never store message/detail bodies;
  the explorer adds a second allowlist layer and never renders raw JSON.
- **Pagination/correlation/append-only:** M6.2 keyset contract reused; correlation
  ids present on admin writes; the M6.1 append-only trigger (blocks UPDATE/DELETE)
  is intact and untouched.

## Access-control decisions

USER/ADMIN: no audit access. SUPER_ADMIN: read-only. Enforced independently in the
server pages (`requirePermission("admin.audit.read")` → redirect), the API routes,
and the query service (`listAuditLogs`/`getAuditLogDetail` each call
`requirePermission`). Role + account status are re-read from the DB every request,
so a mid-session revocation loses access immediately (integration-tested). The
explorer is strictly read-only — no update/delete/clear/export endpoints.

## Query service & API

`src/lib/admin/audit-explorer.ts` (server-only):
- `GET /api/admin/audit-logs` — keyset (createdAt DESC, id DESC), bounded page
  size (≤100), Zod-validated filters: exact `action`, `family` (prefix),
  `targetType`, `targetId`, `actorUserId` (UUID), `correlationId`, `from`/`to`
  date range. Tampered cursors rejected (400). Selective projection; no COUNT.
- `GET /api/admin/audit-logs/[auditId]` — one record + sanitized metadata +
  resolved actor label (name or public slug, never email).

`{data}`/`{error}`, `no-store`, `x-correlation-id`, read-category rate limit;
denials audited.

## Metadata redaction strategy

`src/lib/admin/audit-sanitize.ts` — a presentation layer that never renders raw
audit JSON. Only an **allowlist** of scalar keys survives
(`fromState`, `toState`, `reason`, `previousRole`, `newRole`, `via`, `hasNote`,
`restrictive`); sensitive-looking keys are `[redacted]`, token-like values are
scrubbed, long strings capped, and objects/arrays/unknown keys dropped. Unknown
events fall back to the same allowlist (safe generic fields only). No raw bodies,
headers, reporter identity, email, draft/snapshot JSON, feedback/report text, or
media keys can reach the UI. Stored records are never mutated.

## UI

`/admin/audit-logs` (SUPER_ADMIN-gated) with URL-backed filters (family, actor id,
correlation id, date range), keyset Prev/Next, loading/empty/error/retry states,
responsive table, keyboard/focus, dark mode. `/admin/audit-logs/[auditId]` shows
event identity, timestamp, actor (label + id link to the user record), target
(with a link to the related admin record when authorized — user/portfolio/
feedback/report), outcome, correlation id, safe summary, and the sanitized
metadata key/value list. The admin nav's Audit destination is now live
(SUPER_ADMIN-only via the permission filter).

## Database/index changes

Migration `20261029113939_audit_explorer_indexes`: two additive indexes only
(`(createdAt, id)`, `(correlationId)`). Prisma's spurious `publicSlug`
sequence-drop drift was removed by hand; the allocator and all data are untouched;
`migrate status` clean.

## Verification

`prisma validate` ✓, typecheck ✓, lint ✓, build ✓ (4 new routes). Unit **471
passed** (sanitizer, route guards, shell). Integration (audit-explorer) 5/5:
SUPER_ADMIN-allowed / ADMIN-USER-anon-suspended-revoked-denied, stable pagination
across identical timestamps, family filter, allowlist redaction (secrets/bodies
dropped), NOT_FOUND handling, reads-never-mutate, append-only trigger intact. Full
guarded suite result recorded in the delivery report.

## Remaining risks

- Cursors encode only the keyset position (not a filter fingerprint); the UI
  resets pagination on filter change (consistent with M6.2), so cross-filter
  cursor reuse only continues from a timestamp, never leaks data.
- The `reason` field on moderation events is admin-authored free text shown to
  SUPER_ADMIN (intended); it is length-capped and token-scrubbed but not otherwise
  content-filtered.
- Browser acceptance not yet performed (checklist in the delivery report).

---

# M6.5 work-package plan (M6.5.2–M6.5.4 — NOT implemented in this pass)

## M6.5.2 — Production Security Services (P0, next)

Prerequisites before implementing: provision an Upstash Redis instance and set
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in Vercel (server scope only,
never `NEXT_PUBLIC_*`); provision Cloudflare Turnstile and set
`TURNSTILE_SECRET_KEY` (server) + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` with the
production hostname. Plan: audit the existing `UpstashRateLimitStore`
(atomic INCR+PEXPIRE, window semantics, category isolation, 429/Retry-After,
mutation fail-closed / read fail-open) and the Turnstile verifier (expiry/replay,
fail-closed) against a **live** store/instance; add deterministic
mocked-contract tests separate from live verification; document secure Vercel env
configuration. No credentials invented; verification stays pending until the
services are live.

## M6.5.3 — Business Events & Analytics (P1)

Plan: inspect any existing `BusinessEvent`/`OutboxEvent` model (the BACKEND_SCHEMA
draft describes both; verify actual state) and add typed, versioned, privacy-safe
product events (account created, onboarding completed, template selected,
publish/unpublish/rollback, feedback/report submitted, moderation completed),
distinct from audit logs and GA4. Transactional insertion where loss is
unacceptable; never store feedback/report text, credentials, or draft content;
consent-aware GA4 that never blocks publishing/moderation.

## M6.5.4 — Jobs, Observability & Runbooks (P1)

Plan: inventory real async workloads (outbox delivery, retriable revocation, media
cleanup) before choosing a runner; require at-least-once + idempotent handlers +
backoff + dead-letter + no external calls inside a DB transaction. Minimal
structured logging with correlation ids + error monitoring (Sentry if consistent),
privacy-filtered. Exercise the runbooks (Redis/Turnstile/moderation-revocation/
audit/migration/job/rollback/restore) and mark which are actually drilled.

## Gate status (unchanged — do not close)

G7 (publishing/TLS/warmed-cache) and G8 (admin/moderation/audit/anti-spam/
revocation) remain **open**: live Upstash/Turnstile, CDN/warmed-cache revocation,
business-events, jobs, and observability are still outstanding.
