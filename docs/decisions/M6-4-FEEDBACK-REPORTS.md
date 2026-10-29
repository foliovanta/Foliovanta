# M6.4 — Feedback & Abuse Reporting

Status: implemented (submission + admin triage for both workflows)
Roadmap: ADM-04 (primary), extends ADM-02, ADM-05, ADM-06. Gate G8 remains **open**.
Builds on: M6-1 (RBAC/audit), M6-2 (directories/pagination/rate-limit scaffold), M6-3 (moderation, idempotency, visibility).

## Policy

### Product feedback
Authenticated ACTIVE creators only (no anonymous feedback). Category (`BUG`,
`FEATURE_REQUEST`, `USABILITY`, `OTHER`) + message (≤4000) required. An optional
related portfolio is accepted **only if the submitter owns it**. No attachments.
No IP/device fingerprint stored. Feedback is a private administrative record,
never publicly visible. Statuses: `OPEN → IN_REVIEW → RESOLVED → CLOSED` (CLOSE
reachable from any non-closed state).

### Abuse reports
Submitted against **publicly-eligible** portfolios, by anonymous visitors or
authenticated users. The target is resolved by the owner's **public slug** via
the single shared visibility policy — never by exposing an internal portfolio id.
The response is a **neutral acknowledgment** whether or not the target exists, is
eligible, or a report was created, so it never reveals hidden owner information or
whether enforcement followed. Reporter identity (optional internal user id) is
**never** disclosed to owners or in admin list/detail (only a classification:
`anonymous` | `account`). Reasons: `HARASSMENT`, `IMPERSONATION`, `SPAM`,
`INAPPROPRIATE`, `IP_CONCERN`, `OTHER`. No attachments. **A report never changes
portfolio visibility** and there is **no automatic moderation** from report count
or category. Statuses: `OPEN → IN_REVIEW → {DISMISSED | ACTIONED}`.

**Open / unapproved decisions:** the reason/category lists are MVP proposals, not
legally-approved taxonomies; data-retention periods for feedback and reports need
product/legal sign-off; whether owners ever see aggregate report signals is
deferred; Turnstile is integrated but not provisioned (see below).

## Privacy & retention

- No raw IP or device fingerprint is stored in any row or log. Anonymous reports
  are rate-limited by a salted SHA-256 **hash** of the client IP (transient key
  only). Authenticated submitters are keyed by user id.
- Audit metadata never contains the feedback message or report details — only
  from/to state, a `hasNote` boolean, and the idempotency key.
- `AbuseReport.reporterUserId` is `SetNull` on reporter deletion, and
  `Feedback.userId` cascades — deleted/suspended accounts never corrupt report
  history (reports survive; the reporter link just clears).
- Retention cleanup is **not** implemented (no destructive deletion) pending an
  approved retention policy.

## Schema (additive migration `20261029105924`)

`feedback` and `abuse_reports` tables + four enums. Status-change timestamps
(`statusChangedAt`, `resolvedAt`), optional `resolutionNote`, feedback
`assigneeId` (bare UUID, assignment UI deferred), report `enforcementRef`
(correlation id of the triage that marked it actioned). Indexed for queue
filters `(status, createdAt)` and `(category|portfolioId, createdAt)`. The
spurious Prisma `publicSlug` sequence-drop drift block was removed by hand; the
allocator is untouched. No existing data altered.

## Permission matrix (extends M6.1/M6.3)

| Permission | USER | ADMIN | SUPER_ADMIN |
|---|:--:|:--:|:--:|
| `admin.feedback.read` / `admin.feedback.triage` | — | ✓ | ✓ |
| `admin.reports.read` / `admin.reports.triage` | — | ✓ | ✓ |

Report **triage** (`admin.reports.triage`) does **not** grant portfolio
suspension (`admin.portfolios.moderate`) — they are separate permissions, and the
ACTIONED transition never suspends anything itself.

## API contracts

Submission (`{data}`/`{error}`, `no-store`, correlation id, Zod, size limits):
- `POST /api/feedback` — auth required; `{ category, message, portfolioId? }`;
  fail-closed `feedback` rate limit (10/min/user); 200 `{ received: true }` (no
  internal id); 401/403/400/429/503.
- `POST /api/reports` — public; `{ publicSlug, reason, details?, turnstileToken? }`;
  fail-closed `report` rate limit (5/10min per hashed-IP or user); anonymous
  callers must pass Turnstile when configured; **always** 200 `{ received: true }`
  on a processed request (neutral), else 400/422 (verification)/429/503.

Admin (reuse M6.2 directory + M6.3 command conventions):
- `GET /api/admin/feedback`, `GET /api/admin/feedback/[id]`, `POST /api/admin/feedback/[id]/triage`
- `GET /api/admin/reports`, `GET /api/admin/reports/[id]`, `POST /api/admin/reports/[id]/triage`

Keyset pagination, selective projections, no raw Prisma models, no reporter
identity. Triage bodies: `{ action, expectedStatus?, resolutionNote?, idempotencyKey }`.

## Status-transition contracts & audit

Triage reuses the M6.3 pattern: `requirePermission` → `FOR UPDATE` lock →
expected-state CAS → transition validation → update → **audit in the same
transaction** → idempotency ledger (`moderation_commands`) in the same
transaction. Idempotent replay (same key+payload) returns the original result;
key reuse with a different payload → `IDEMPOTENCY_CONFLICT`. Audit catalog
additions: `feedback.review_started`, `feedback.resolved`, `feedback.closed`,
`report.review_started`, `report.dismissed`, `report.actioned` (+ `*.denied`).
Audit-insert failure rolls back the transition (atomic).

## Anti-spam & rate-limit policy

Reuses the shared `RateLimitStore`/`enforceRateLimit` (Upstash in prod, in-memory
in dev — **production still BLOCKED until Upstash is provisioned**). New
categories: `feedback` (10/min, fail-closed) and `report` (5/10min, fail-closed).
Anonymous reports are bucketed per **salted-hashed network id** (never a global
anonymous bucket, so one actor can't lock out all anonymous reporting, and no raw
IP is used). Cloudflare **Turnstile** is implemented server-side
(`verifyTurnstile`): required for anonymous reports when `TURNSTILE_SECRET_KEY` is
set; when unset it is a logged no-op and intake relies on rate limiting (strong
bot protection is production-pending, never trusting the client widget). If the
limiter store is unavailable, writes fail **closed** (503). No production
credentials were invented.

## Moderation integration

The report workflow connects to M6.3 without duplicating logic: submitting a
report never restricts a portfolio; dismissing never changes moderation; marking
a report **ACTIONED requires the portfolio to already be SUSPENDED** (done via the
M6.3 moderation service from the portfolio admin panel) — otherwise the triage is
rejected `ENFORCEMENT_REQUIRED`. Report status is therefore never the source of
truth for public eligibility (the shared evaluator is). Reinstating a portfolio
does not erase report history.

## Threat model (intake-specific)

- Spam / anonymous abuse → fail-closed per-identity rate limits + optional
  Turnstile + input size caps + dedup.
- Reporter de-anonymization → identity never returned in any admin DTO or to
  owners; only a classification.
- Target enumeration via reports → neutral ack regardless of target state.
- Forged submitter / privilege escalation → feedback derives the user from Clerk+DB
  (client ids never trusted); every admin service re-checks role/status/permission;
  mid-session role revocation revokes on the next request (tested).
- False "actioned" → ACTIONED gated on real suspension state.
- Audit tampering → append-only trigger; writes in-transaction.

## Verification

`prisma validate` ✓, typecheck ✓, lint ✓, build ✓ (13 new routes + `/feedback`).
Unit **459 passed** (anti-spam, intake guards, admin triage guards, shell). DB
integration: feedback/reports suite 8/8 (submission authz + ownership + dedup,
neutral ack across eligible/unknown/unpublished targets, no auto-moderation,
reporter classification without identity leak, triage transitions + idempotency +
audit-without-message, ACTIONED-requires-enforcement, dismiss-doesn't-moderate,
mid-session revocation). Full-suite result recorded in the delivery report.

**Not verified:** live Upstash + live Turnstile (no credentials); real-browser
acceptance (no browser).
