# Runbook — Feedback & Abuse Reports (M6.4)

Full policy: `docs/decisions/M6-4-FEEDBACK-REPORTS.md`.

## What exists

- **Creator feedback**: `/feedback` (authenticated) → `POST /api/feedback`.
- **Public abuse report**: a discreet "Report this portfolio" control on every
  public portfolio page → `POST /api/reports` (keyed by public slug).
- **Admin queues**: `/admin/feedback` and `/admin/reports` (list + detail), with
  triage actions. ADMIN and SUPER_ADMIN can read and triage both.

## Triage

Feedback: `Start review → Resolve / Close` (optional resolution note).
Reports: `Start review → Dismiss` (no enforcement), or `Mark actioned`.

**Marking a report "actioned" requires the portfolio to already be SUSPENDED.**
To enforce: open the report → "Open portfolio detail" → use the **Moderation**
panel (M6.3) to suspend → return to the report → "Mark actioned". The server
rejects "actioned" with `ENFORCEMENT_REQUIRED` if the portfolio isn't suspended.
Report status never changes public visibility by itself.

Every triage writes an immutable audit record; the feedback message / report
details are never copied into audit metadata.

## Anti-spam

- Fail-closed per-identity rate limits: feedback 10/min/user, reports 5/10min
  (per hashed network id for anonymous, per user otherwise).
- Anonymous reports require Cloudflare Turnstile **when configured**
  (`TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). Unconfigured → intake
  relies on rate limiting only (strong bot protection is production-pending).

## Troubleshooting

- **429 / 503 on submit** — rate limited, or (503) the shared limiter store is
  down and writes fail closed. Restore Upstash and retry.
- **422 on an anonymous report** — Turnstile verification failed; re-challenge.
- **Report won't mark actioned (409 ENFORCEMENT_REQUIRED)** — suspend the
  portfolio first via Moderation.
- **Reporter identity** — intentionally not stored/exposed beyond
  anonymous/account classification. There is nothing to look up.

## Production dependencies (not provisioned here)

- Upstash Redis (`UPSTASH_REDIS_REST_URL`/`_TOKEN`) for distributed rate limits.
- Cloudflare Turnstile keys for anonymous bot protection.
- An approved data-retention policy before any audit/report cleanup.
