# M6.5.2 — Production Security Services

Status: **implementation complete; production-security acceptance BLOCKED** (no live Upstash/Turnstile credentials or deployment in this environment).
Roadmap: hardens ADM-04 / ADM-06 anti-spam; contributes to Gate G8 (not closing it).
Builds on: M6-4 (rate-limit + Turnstile scaffold), M6-5-1.

These are two **distinct** states; this milestone reaches the first, not the second.

## Phase 0 — security audit (findings)

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | `INCR`+`PEXPIRE NX` pipeline was not atomic; a key could in theory persist without a TTL → permanent lockout | Medium | Single atomic Lua `EVAL` (INCR + conditional PEXPIRE + PTTL), TTL guaranteed on first hit |
| 2 | Silent in-memory fallback in production when Upstash env absent | High | Explicit security mode; strict mode never returns a local store → write categories fail closed |
| 3 | Client IP from `x-forwarded-for` first hop (attacker-prependable) → per-IP report limit bypass | High | Prefer Vercel `x-real-ip`; IPv6 /64 aggregation; Turnstile is the authoritative anonymous control |
| 4 | Strict-mode missing Turnstile silently disabled anonymous protection | High | Strict + anonymous requires configured + verified; unconfigured → 503 fail-closed |
| 5 | No hostname/action validation; Cloudflare error codes dropped | Low | Optional pinned-hostname check; error codes surfaced for logging (never the token) |
| 6 | Rate-limit keys not environment-namespaced | Low | Keys prefixed with the deployment namespace |

Values verified in-repo (unchanged, now confirmed): read 120/min fail-open; mutation 20/min, feedback 10/min, report 5/10min — all fail-closed.

## Security configuration contract

`src/lib/env/security.ts` → `securityMode()` returns **strict** or **relaxed**,
derived only from server env (`SECURITY_MODE` override, else `APP_ENV ∈
{production,staging}` or `NODE_ENV=production` → strict; else relaxed). It is never
selectable by a request field. `deploymentNamespace()` namespaces shared keys.

| Mode | Rate-limit store | Turnstile (anonymous reports) |
|---|---|---|
| local dev | in-memory allowed | optional (unconfigured = allowed) |
| automated test | injected/fake | mocked; live tests opt-in |
| staging / production (strict) | shared Upstash **required**; no in-memory fallback | **required**; unconfigured = fail closed |

## Distributed rate limiting

`UpstashRateLimitStore.hit` runs one atomic Lua `EVAL` (single source:
`src/lib/admin/rate-limit-lua.ts`), returning `[count, pttl]`; `resetAt` is derived
from the real PTTL. Algorithm: **fixed window** (documented as such — not sliding).
`resolveAdminRateLimitStore()` returns the Upstash store, an in-memory store
(relaxed only), or **null** (strict without Upstash). Keys:
`ratelimit:<env>:<category>:<identity>` — per environment, per category, per
identity; the token is never in a key or log; the anonymous identity is a salted
hash. Shared enforcement across instances comes from Upstash being the single
counter authority (proven by the opt-in live script, not by unit tests).

### Fail-open / fail-closed matrix

| Operation class | Store unavailable / error |
|---|---|
| Read-only admin queries | **fail OPEN** (allow; documented availability tradeoff) |
| Privileged admin mutations | **fail CLOSED** → 503, mutation not executed |
| Feedback submission | **fail CLOSED** → 503 (client preserves input) |
| Anonymous abuse report | **fail CLOSED** → 503; also fails closed if required Turnstile fails |
| Public portfolio reads | no rate-limit dependency (unchanged) |

Provider-outage handling never bypasses authorization or moderation — those are enforced independently. Rejections return 429 + `Retry-After`; unavailability returns 503; neither leaks store internals or identity.

## Anonymous identity security

`clientNetwork()` prefers `x-real-ip` (Vercel-set, not client-overridable) over
the first `x-forwarded-for` hop; IPv6 is aggregated to /64, IPv4 used whole; the
value is salted-SHA-256 hashed (`ANTISPAM_SALT`, server-only) into a transient
rate-limit key and **never stored or logged raw**. Trust assumption: reliable only
behind a trusted proxy (Vercel) that sets these headers; behind an untrusted proxy
headers are spoofable, so **Turnstile is the real anonymous control** and IP
limiting is a best-effort secondary bound. NAT/shared-IPv4 can over-bucket;
salt rotation invalidates all buckets (documented in the runbook).

## Turnstile

Server-side verification against the official siteverify endpoint; a token is
never trusted because the widget rendered. Validates provider `success`, optional
pinned hostname (`TURNSTILE_EXPECTED_HOSTNAME`), and surfaces error codes
(`timeout-or-duplicate` covers replay/expiry — Cloudflare enforces single-use, so
no app-side token cache is needed). Missing token, malformed/invalid/expired/
replayed token, hostname mismatch, provider error, and network failure all fail
closed. **Policy:** authenticated reporters are exempt from Turnstile (documented
decision); anonymous reports require it in strict mode. A reused token cannot
authorize a different payload because each submit performs its own siteverify and
Cloudflare rejects the second use. No bypass flag exists and no client field can
activate one.

## Environment variables

Server-only (never `NEXT_PUBLIC_*`): `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `TURNSTILE_SECRET_KEY`, `ANTISPAM_SALT`,
`TURNSTILE_EXPECTED_HOSTNAME` (optional), `SECURITY_MODE` (optional override).
Public: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` only. Secrets are never logged, printed by
the verify scripts, or embedded in Redis keys.

## Provisioning (human action required — see runbooks for full steps)

**Upstash:** create a Redis DB (region near the Vercel deployment) → copy REST
URL + token → set both as server env in Vercel per environment (Production +
Preview/staging) → redeploy → run `pnpm verify:upstash` with the creds.
**Turnstile:** create a widget for the production hostname(s) → set
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` → deploy to staging →
run `pnpm verify:turnstile` + browser solve.

## Verification

Static: `prisma validate` ✓, typecheck ✓, lint ✓, build ✓.
Automated (mocked/deterministic): unit **483 passed** — atomic EVAL contract,
store resolution by mode (strict→null, relaxed→in-memory, env→Upstash), fail
matrix with null store, IP-trust (`x-real-ip` over spoofed XFF, IPv6 /64),
Turnstile hostname/error/replay paths, strict-mode report 503. Integration: full
guarded suite result in the delivery report.
Live provider: **BLOCKED** — `pnpm verify:upstash` / `pnpm verify:turnstile` are
implemented and correctly refuse (exit 1) without credentials; no live run has
occurred. Staging + production + browser acceptance: **pending** (no deployment).

## Gate G8 evidence status

Still OPEN. Provided: hardened distributed limiting + Turnstile + fail matrix +
tests + runbooks. Missing for closure: live Upstash + live Turnstile verification,
staging distributed-enforcement + failure-injection evidence, and browser
acceptance. Do not close G8 on implementation alone.

## M6.5.3 readiness

Security services are implementation-complete and unblock nothing for M6.5.3
(business events) technically, but M6.5.2 **production acceptance** should be
confirmed before relying on these controls in production. M6.5.3 remains not
started.
