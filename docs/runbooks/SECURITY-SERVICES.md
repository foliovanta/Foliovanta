# Runbook — Production Security Services (Upstash + Turnstile)

Policy & architecture: `docs/decisions/M6-5-2-PRODUCTION-SECURITY.md`.
Opt-in live checks: `pnpm verify:upstash`, `pnpm verify:turnstile` (need creds; never print secrets).

## Environment variables (Vercel, server scope — never `NEXT_PUBLIC_*` except the site key)

| Variable | Scope | Purpose |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | server | shared rate-limit store |
| `TURNSTILE_SECRET_KEY` | server | Turnstile server verification |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Turnstile widget |
| `ANTISPAM_SALT` | server | salts the anonymous network hash |
| `TURNSTILE_EXPECTED_HOSTNAME` | server (optional) | pin Turnstile hostname |
| `SECURITY_MODE` | server (optional) | force `strict`/`relaxed` (else derived from `APP_ENV`/`NODE_ENV`) |

Set Production and Preview/staging separately. Preview/staging is **strict** too.

## Provisioning

### Upstash
1. Upstash console → create Redis DB; pick a region near the Vercel deployment region.
2. Configure plan security options (TLS REST is default).
3. Copy the REST URL + REST token.
4. Vercel → Project → Settings → Environment Variables → add both for Production and Preview (server).
5. Keep dev/staging/prod on **separate** databases (or rely on the env-namespaced keys at minimum).
6. Redeploy.
7. `pnpm verify:upstash` with the creds → expect connectivity + threshold + expiry + isolation OK.
8. Confirm key expiry (PTTL) and distributed behavior (run the script from two processes).
9. Document the token; rotate per the rotation section.

### Turnstile
1. Cloudflare → Turnstile → create a widget; set the production hostname(s).
2. Choose the approved widget mode (managed).
3. Copy site key + secret.
4. Vercel: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public) + `TURNSTILE_SECRET_KEY` (server), per environment; optionally `TURNSTILE_EXPECTED_HOSTNAME`.
5. Deploy to staging; solve the widget; submit an anonymous report → 200 neutral ack.
6. Submit without/with an invalid/expired/replayed token → 422; confirm `pnpm verify:turnstile` rejects an invalid token.
7. Rotate the secret per the rotation section.

## Redis (Upstash) outage
- **Detection:** `Rate limiter store error` / `Rate limiter unavailable` warnings; 503s on admin mutations, feedback, and anonymous reports; 429s stop appearing.
- **Impact (by design):** writes fail CLOSED (503, retryable); admin reads fail OPEN (still work). Public portfolio reads unaffected. Authorization/moderation never bypassed.
- **Recovery:** restore the Upstash DB / fix the REST URL+token; redeploy if env changed. Counters resume; in-flight windows simply reset.
- **Verify:** `pnpm verify:upstash`; confirm 429 returns at the threshold again.
- **Escalate** if the outage exceeds the agreed availability objective.

## Turnstile outage
- **Detection:** `Turnstile verification failed` (errorCodes `provider-unreachable`) or `Turnstile required but not configured (strict mode)`; anonymous reports 422/503.
- **Impact:** anonymous reporting fails closed (422/503). Authenticated reporting and all other flows unaffected.
- **Recovery:** restore Cloudflare config / secret; browser retry path re-challenges automatically.
- **Verify:** `pnpm verify:turnstile`; a staging browser solve succeeds.

## Credential rotation
- **Upstash token:** create a new token in Upstash → update Vercel env → redeploy → `pnpm verify:upstash` → revoke the old token. (Counters are unaffected; same DB.)
- **Turnstile secret:** rotate in Cloudflare → update `TURNSTILE_SECRET_KEY` → redeploy → `pnpm verify:turnstile`. Rotate the site key only with a coordinated widget change.
- **`ANTISPAM_SALT`:** rotating invalidates all anonymous buckets (everyone briefly gets a fresh allowance) — acceptable; do it off-peak.
- Rollback: re-set the previous env values and redeploy; never commit any secret.

## Misconfiguration
- **Missing Upstash in strict mode:** writes 503 by design (not silent memory). Fix: set both env vars, redeploy.
- **Missing Turnstile in strict mode:** anonymous reports 503. Fix: set site key + secret.
- **Wrong hostname:** Turnstile `hostname-mismatch` → verification fails. Fix the widget hostname or `TURNSTILE_EXPECTED_HOSTNAME`.
- **Preview/prod mismatch:** ensure env vars exist for the Preview environment too (it runs strict).

## Troubleshooting (never prints secrets)
- Store class in use: check logs for `Rate limiter unavailable`/`store error` warnings (they include env + failMode only).
- Confirm env presence without values: Vercel env UI, or a safe diagnostic that logs only `present: true/false`.
