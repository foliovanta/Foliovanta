# M6.3 — Moderation & Public Visibility Enforcement

Status: implemented (portfolio + account moderation, read-only everything else)
Roadmap: ADM-03, extends ADM-06, PUB-07, PUB-10. Gates G7 and G8 remain **open**.
Builds on: M6-1 (RBAC, audit), M6-2 (directories, rate-limit scaffold, visibility policy).

## Moderation policy

Account moderation is distinct from and more consequential than portfolio moderation.

**Portfolio** (`moderationStatus`: CLEAR / UNDER_REVIEW / SUSPENDED):

| Action | From → To | Reason | Public effect |
|---|---|---|---|
| SUSPEND | CLEAR, UNDER_REVIEW → SUSPENDED | required | not publicly eligible |
| MARK_UNDER_REVIEW | CLEAR → UNDER_REVIEW | required | **still visible** |
| CLEAR_REVIEW | UNDER_REVIEW → CLEAR | optional | no change |
| REINSTATE | SUSPENDED → CLEAR | optional | eligible again **iff** independently publication-eligible |

**Account** (`status`: ACTIVE / SUSPENDED / DELETION_PENDING):

| Action | From → To | Reason | Effect |
|---|---|---|---|
| SUSPEND | ACTIVE → SUSPENDED | required | no owner/admin access; **all** the account's portfolios become publicly inaccessible |
| REINSTATE | SUSPENDED → ACTIVE | optional | access restored; portfolios visible only if independently eligible |

Invariants: re-applying the current state is an idempotent no-op (not an error);
immutable published snapshots are never edited or deleted; draft content is never
touched; reinstatement never silently republishes an unpublished portfolio; a
DELETION_PENDING account cannot be suspended/reinstated.

**Open / unapproved policy decisions:** (1) account suspension targets only
USER-role accounts — admin-on-admin restriction, self-suspension, and
last-SUPER_ADMIN protection are collapsed into "no admin targets" pending an
approved admin-governance policy; (2) a hard DELETED account state (vs the
existing DELETION_PENDING tombstone) is not introduced; (3) the maximum
stale-content exposure objective (below) needs product sign-off.

## Permission matrix (extends M6.1)

| Permission | USER | ADMIN | SUPER_ADMIN |
|---|:--:|:--:|:--:|
| `admin.moderation.read` | — | ✓ | ✓ |
| `admin.portfolios.moderate` | — | ✓ | ✓ |
| `admin.users.suspend` | — | — | ✓ |

Account suspension does **not** inherit portfolio moderation: ADMIN can moderate
portfolios but cannot restrict accounts. Enforced in services (DB-authoritative
`requirePermission`), routes, and UI action visibility.

## Moderation command architecture

`src/lib/admin/moderation.ts` — `moderatePortfolio` / `moderateAccount`. Each:
authenticates, re-reads role/status from the DB, checks the exact permission,
validates the target + transition + reason, takes a `SELECT … FOR UPDATE` row
lock, re-checks expected state (optimistic concurrency), updates state, writes
the audit record **in the same transaction**, records the idempotency ledger row
in the same transaction, and returns a safe typed result. Pure transition rules
live in `moderation-policy.ts`. No read-then-write outside the lock.

## Idempotency & race safety

New table `moderation_commands` (additive migration `20261029102001`): unique
`idempotencyKey`, plus `actorUserId`, `operation`, `targetType`, `targetId`, a
SHA-256 `fingerprint` of the canonical payload, and the stored `result`.

- Same key + same payload → the original result is replayed (`replayed: true`), no
  re-transition, no duplicate audit.
- Same key + different payload → `IDEMPOTENCY_CONFLICT` (409).
- Concurrent same-key requests race on the unique constraint; the loser catches
  P2002 and replays the winner's result.
- Stale `expectedModerationStatus`/`expectedStatus` → `STATE_CONFLICT` (409), so an
  old reinstatement can never silently undo a newer suspension.
- Concurrent different-key suspends serialize on the row lock; the second sees the
  new state and becomes a no-op — exactly one transition, one audit.

## Transactional audit

Audit events are written **inside** the state-change transaction — if the audit
insert fails, the mutation rolls back (never a state change without its record).
New catalog entries (append-only, immutable DB trigger from M6.1):
`moderation.portfolio.{suspend,reinstate,mark_under_review,clear_review}`,
`moderation.account.{suspend,reinstate}`, and denial events
`moderation.{portfolio,account}.denied`. Metadata captures `fromState`, `toState`,
`reason`, `idempotencyKey`, and a `revocation` descriptor for restrictive actions.
No secrets or raw bodies.

## Public visibility enforcement

One policy, one evaluator: every public surface uses
`src/lib/publishing/visibility.ts`. In M6.3 the media delivery proxy was
refactored off its private inline predicate onto `evaluatePublicVisibility`, so
there is no second eligibility definition anywhere. Surfaces verified: public
page + legacy `/p` route, snapshot resolution, metadata, OG image, Twitter card,
JSON-LD, sitemap, robots, and the media proxy. A SUSPENDED portfolio or a
SUSPENDED/inactive owner is excluded from all of them (integration-tested).
Restored portfolios reappear only if independently publication-eligible.

## Cache revocation strategy

Database state is authoritative. Every public surface is already `no-store` /
`force-dynamic` and re-reads the DB per request, so a moderation change takes
effect on the **next** request with no purge step:

- Public page, legacy route, sitemap: `force-dynamic`.
- Media proxy: `force-dynamic` + `no-store`, re-checks visibility per request.
- OG image: **changed in M6.3** to `force-dynamic` (previously cacheable) — the
  one gap that could have served a stale card is now closed.

A durable `revocation` descriptor is written into the restrictive-action audit
record (observable/queryable). No async outbox is needed because revocation is
synchronous at the origin; if a CDN layer is added later, that audit event is the
hook and this section must be revisited.

**Maximum stale-content exposure objective (PROPOSED, needs approval):** at the
origin, 0 seconds (next request is authoritative). With a future CDN/browser
cache, bounded by that layer's max-age; none is configured today. **Not
production-verified** — no staging/CDN deployment evidence exists in this
environment; see the deployment checklist.

## Rate limiting (shared store)

`src/lib/admin/rate-limit.ts` rewritten: `RateLimitStore` interface +
`InMemoryRateLimitStore` (dev/test, `shared=false`) + `UpstashRateLimitStore`
(REST, atomic INCR+PEXPIRE(NX), `shared=true`), selected automatically when
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set. `enforceRateLimit`
takes a category: **read** (120/min, fail-**open** on store outage — availability
of oversight) and **mutation** (20/min, fail-**closed** → 503 on store outage — a
privileged change never slips through an unavailable limiter). Buckets are
per-identity + per-category (no cross-actor lockout; the token is never logged or
placed in a key). Injectable store for tests.

**Production readiness is BLOCKED** until Upstash credentials are configured and
live-verified; `isRateLimitProductionReady()` reports the in-memory store as not
ready. No silent in-memory fallback is presented as production protection. The
Upstash integration is implemented and unit-tested with injected stores; **it has
not been verified against a live Upstash instance** (no credentials in this env).

## API contracts

- `POST /api/admin/portfolios/{portfolioId}/moderation`
  body `{ action: SUSPEND|REINSTATE|MARK_UNDER_REVIEW|CLEAR_REVIEW, reason?, expectedModerationStatus?, idempotencyKey }`
- `POST /api/admin/users/{userId}/moderation`
  body `{ action: SUSPEND|REINSTATE, reason?, expectedStatus?, idempotencyKey }`

`{data}`/`{error}`, `no-store`, `x-correlation-id`, strict Zod, server-enforced
permissions. Statuses: 200, 400 (validation), 401/403 (authz incl. SELF_TARGET /
ADMIN_TARGET → 403), 404, 409 (INVALID_TRANSITION / STATE_CONFLICT /
IDEMPOTENCY_CONFLICT), 422 (REASON_REQUIRED), 429 (rate limit), 503 (mutation
limiter fail-closed). No raw Prisma objects; no audit metadata to clients.

## Admin UI

`/admin/portfolios/[portfolioId]` and `/admin/users/[userId]` gained moderation
panels: current state, authorized actions only, required/optional reason input,
an explicit confirmation with a **consequence summary**, pending state, duplicate-
submit prevention (plus server idempotency), success/no-change/conflict/error
feedback, and a server-confirmed `router.refresh()`. The reinstatement
confirmation explicitly does not promise republication. Keyboard/focus/dark-mode/
mobile consistent with the existing shell. The nav keeps Moderation/Feedback/
Reports/Audit as placeholders (no queues this milestone).

## Threat model (moderation-specific)

- Privilege escalation / forged roles → every service re-reads role from the DB;
  client roles are never trusted; mid-session role revocation revokes on the next
  request (tested).
- Horizontal bypass → admins act only through authorized admin services; owner-
  only `/preview` is never reused with admin creds; cross-owner is intentional and
  permission-gated.
- Stale reinstatement undoing a newer suspension → optimistic concurrency +
  idempotency ledger.
- Cache re-exposure after suspension → all surfaces force-dynamic/no-store.
- Limiter abuse / DoS of mutations → per-identity strict mutation bucket,
  fail-closed on outage.
- Audit tampering → append-only DB trigger; writes are in-transaction.

## Verification

`prisma validate` ✓, typecheck ✓, lint ✓, build ✓ (both moderation routes). Unit
**439 passed**. Integration **157 passed + 2 skipped** (full suite, no flake),
including the 11-case moderation lifecycle: authz tiers, suspend/reinstate/review
transitions, public-read + sitemap exclusion, reason/stale-state rejection,
idempotent replay + key-reuse conflict, concurrent-suspend serialization,
atomic state+audit, suspend-blocks-publish/rollback, account suspension hiding
owner portfolios, self/admin-target blocks, deletion-pending rejection, and
mid-session role revocation.

**Not verified:** live Upstash rate limiting; CDN/staging cache revocation;
real-browser acceptance (no browser) — see checklists in the delivery report.
