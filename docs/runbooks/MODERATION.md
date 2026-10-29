# Runbook — Moderation (M6.3)

Scope: restrict/restore portfolios and USER accounts. Read `docs/decisions/M6-3-MODERATION.md` for the full policy.

## Who can do what

- **ADMIN**: portfolio moderation (SUSPEND / REINSTATE / MARK_UNDER_REVIEW / CLEAR_REVIEW).
- **SUPER_ADMIN**: the above, plus account SUSPEND / REINSTATE (USER accounts only).
- Account suspension of ADMIN/SUPER_ADMIN accounts is **not** supported (policy open).

## How to moderate

1. Open `/admin/portfolios/{id}` or `/admin/users/{id}`.
2. Pick an action → confirm with a reason (required for suspend / mark-under-review).
3. The confirmation states the public consequence. Submit; the UI shows the result.

Every action writes an immutable audit record (`moderation.*`) with actor, from/to
state, reason, and correlation id. Nothing is ever deleted or edited in the draft or
published snapshots.

## Effects

- **Portfolio SUSPENDED** → immediately inaccessible on every public surface (page,
  legacy route, metadata, OG image, sitemap, media). Publish and rollback are blocked.
- **UNDER_REVIEW** → still public (a flag only).
- **Account SUSPENDED** → no owner/admin access; all the account's portfolios hidden.
- **REINSTATE** → lifts the block; a portfolio returns to public **only if** it is
  independently publication-eligible. Never auto-republishes.

Revocation is immediate at the origin (all public surfaces are `force-dynamic`/`no-store`).
There is no CDN today; if one is added, see the cache-revocation section of the ADR.

## Troubleshooting

- **409 STATE_CONFLICT** — someone else changed the state; reload the detail page and retry.
- **409 IDEMPOTENCY_CONFLICT** — the idempotency key was reused with a different request;
  the UI generates a fresh key per submit, so this indicates a client bug or a replay probe.
- **503 on a moderation submit** — the shared rate-limit store is unavailable and mutations
  fail closed by design. Restore the store (Upstash) and retry.
- **Suspended content still visible** — confirm DB `moderationStatus`/owner `status`; the
  public read is DB-authoritative. If a CDN is ever added, purge it (not configured today).

## Still manual / future

- Abuse-report and feedback queues (ADM-04) — not built.
- Live Upstash rate-limit verification and CDN purge integration.
