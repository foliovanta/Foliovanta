# M6.1 — Super Admin RBAC, Audit Foundations & Admin Shell

Status: implemented (foundation)
Roadmap: ADM-01, ADM-02, ADM-05, ADM-06 (all partial), AUTH-03; Gate G8 **not** complete
Related: `M3-6-VERSION-HISTORY-ROLLBACK.md` (publishing lifecycle this overview counts)

## Context

The admin platform had no foundation: the `UserRole` enum carried only `USER` and
`SUPER_ADMIN` (no `ADMIN`), there was no authorization layer beyond the owner-scoped
`resolveActiveUser`, no audit model, no `/admin` routes, and no rate limiting. Clerk
authenticates; the database is the authority for roles and account status.

## Schema changes (additive, backward-compatible)

Two migrations, both forward-only and non-destructive (each had Prisma's spurious
`DROP SEQUENCE users_public_slug_seq` drift block removed by hand — a known quirk
with the `dbgenerated` sequence default; the public-slug allocator is untouched):

- `20261029084525_admin_rbac_audit`: adds the `ADMIN` enum value; adds the
  `AuditOutcome` enum; creates `audit_logs` with indexes; installs an
  **append-only trigger** that raises on any `UPDATE`/`DELETE`.
- `20261029090407_audit_log_drop_actor_fk`: drops the `audit_logs.actorUserId`
  foreign key. `actorUserId` is now a bare nullable UUID — an audit record is a
  permanent fact, so the actor id is preserved verbatim even after the account is
  deleted, and the append-only trigger can block every mutation without a FK
  `ON DELETE SET NULL` fighting it (that conflict is why the FK was removed).

**Rollback implications:** both are reversible by dropping the added objects
(`DROP TRIGGER`/`FUNCTION`, `DROP TABLE audit_logs`, `DROP TYPE AuditOutcome`).
A Postgres enum value cannot be removed, so `ADMIN` would remain if rolled back —
harmless, since nothing is forced to use it. No data migration is needed either way.

## Authorization architecture

Deny-by-default, enforced entirely server-side; the client never asserts a role.

- `src/lib/auth/permissions.ts` (pure, client-safe): the `Permission` union, the
  `ROLE_PERMISSIONS` matrix, and `can(role, permission)`. One source of truth,
  importable by both the server gate and the navigation UI.
- `src/lib/auth/authorization.ts` (`server-only`): `resolveAdminActor()` and
  `requirePermission(permission)`. Every call: (1) verifies Clerk auth; (2) loads
  the internal user **from the DB**; (3) requires `status = ACTIVE`; (4) requires
  an admin role / the specific permission. Role and status are read live on every
  request, so a revoked or suspended admin loses access on their **next request**
  without signing out. Every authenticated-but-denied case returns status 403 with
  an identical client body (the specific reason is audited, not disclosed).

Middleware (`src/proxy.ts`) adds `/admin` and `/api/admin` to the authenticated
matcher as defense in depth only — it is never the authority.

### Permission matrix

| Permission | USER | ADMIN | SUPER_ADMIN |
|---|:--:|:--:|:--:|
| `admin.access` | — | ✓ | ✓ |
| `admin.overview.read` | — | ✓ | ✓ |
| `admin.users.read` | — | ✓ | ✓ |
| `admin.portfolios.read` | — | ✓ | ✓ |
| `admin.moderation.read` | — | ✓ | ✓ |
| `admin.reports.read` | — | ✓ | ✓ |
| `admin.audit.read` | — | — | ✓ |
| `admin.roles.manage` | — | — | ✓ |

ADMIN is operational read-only oversight. Audit-log access and role management are
SUPER_ADMIN-only, so an ADMIN role is never "unrestricted" just by being admin.
(These are read-capability foundations; the write actions behind moderation/reports
arrive in later milestones and will each gate on their own permission.)

## Super Admin bootstrap policy

There is **no in-app self-promotion** and no role field in any editable profile or
client request. The sole path to the first administrator is an operator-run CLI,
`scripts/admin/grant-role.ts` (`pnpm admin:grant-role`), which:

- names the exact target account explicitly (`--clerk-user-id` or `--email`);
- requires `--confirm <clerk-user-id>` equal to the resolved account's Clerk id —
  explicit operator confirmation of exactly which account is promoted;
- refuses to run against production unless `ALLOW_PROD_ROLE_BOOTSTRAP=1`;
- grants only `ADMIN`/`SUPER_ADMIN`, only to an `ACTIVE` account;
- writes an immutable `admin.role.granted` audit record (actor null = operator/CLI,
  metadata `{ previousRole, newRole, via: "cli-bootstrap" }`);
- hardcodes no identities/emails and auto-promotes no one.

## Audit logging architecture

- Model `AuditLog`: `id`, `actorUserId?`, `action`, `targetType?`, `targetId?`,
  `outcome` (SUCCESS/FAILURE/DENIED), `correlationId?`, `metadata?` (JSONB),
  `createdAt`. Indexed on `(actorUserId, createdAt)`, `(action, createdAt)`,
  `(targetType, targetId)`.
- **Immutability** enforced at the database: a trigger blocks every `UPDATE` and
  `DELETE`. The app has no update/delete path. Operational logs (`console.*`) are
  kept strictly separate from these durable records.
- `src/lib/audit/audit-log.ts`: `recordAudit(input, db?)` accepts a transaction
  client so an audit write can be **coupled atomically** to a future critical
  mutation (both commit or neither). `sanitizeMetadata` redacts sensitive-looking
  keys (password/secret/token/authorization/cookie/session/api key/credential) and
  caps long strings — never credentials, tokens, session data, or raw bodies.
  `recordAuthorizationFailure` logs denied/failed authorization **outside** any
  mutation transaction and swallows its own errors (a failed security-log write
  must never turn a clean 401/403 into a 500).

### Audit event catalog (this milestone)

| Action | Outcome | When |
|---|---|---|
| `admin.role.granted` | SUCCESS | CLI bootstrap changes a user's role |
| `admin.overview.read.denied` | DENIED | authenticated non-admin hits the overview API |

### Retention & access — PENDING APPROVAL

Not yet implemented; requires product/security/legal sign-off before the moderation
milestone: retention period for audit records; who may read them (currently
SUPER_ADMIN via `admin.audit.read`, with no UI yet); export/erasure interaction with
account deletion (the actor id is retained in the immutable record by design).

## API & service boundaries

- `GET /api/admin/overview`: gated by `requirePermission("admin.overview.read")`,
  returns aggregate counts only (no PII), mints/propagates an `x-correlation-id`,
  `no-store`, uniform safe error bodies, and audits authenticated denials.
- `src/lib/admin/pagination.ts`: shared opaque-cursor `CursorPage<T>` contract +
  `parsePageParams` (bounded page size) for future admin lists — defined now so
  every list speaks one shape.
- Services return typed aggregates/DTOs, never raw Prisma models. No admin mutation
  endpoints were added (none is needed this milestone).

## Admin shell & overview

`/admin` (server layout gates via `resolveAdminActor`; non-admins are redirected and
never see the surface exists). Responsive shell: sidebar + role-aware navigation +
administrator identity/role + mobile drawer, with loading and error states.
Navigation lists Overview (live), Users, Portfolios, Moderation, Feedback & reports,
and Audit logs (SUPER_ADMIN only) — the unbuilt ones are shown as accurate,
non-interactive "Soon" placeholders, never fake dashboards. The Overview page renders
three real, privacy-safe counts (users not pending deletion; non-deleted portfolios;
currently publicly-visible portfolios) with precise definitions.

## Verification

Typecheck ✓, lint ✓, build ✓ (`/admin`, `/api/admin/overview` registered). Unit 384
passed (31 new). DB integration: admin-rbac 8/8 (DB-authoritative role resolution,
mid-session revocation, vertical-escalation block, append-only immutability via the
trigger, metadata redaction, transactional audit insertion, overview count deltas).
Full integration run 135 passed + 2 skipped with one pre-existing transient Neon
flake in `rollback.test.ts` (10/10 on isolated re-run — not a regression).

## Not done / out of scope / risks

- Gate G8 remains **open**: moderation and report workflows, public suspension
  revocation bound, and the full privileged-mutation audit coverage are future.
- Cross-tenant admin data access is N/A this milestone (no admin resource-by-id
  fetch exists yet); it must be verified when ADM data-access lists ship.
- No rate limiting on admin endpoints yet (none existed in the repo); add before
  mutation endpoints.
- Real-browser acceptance of the admin shell was **not performed** (no browser in
  this environment) — see the checklist in the delivery report.
