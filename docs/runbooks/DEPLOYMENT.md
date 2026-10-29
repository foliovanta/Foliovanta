# Runbook — Git & Vercel Deployment Foundation

Prepares branch workflow + Vercel/Neon/Clerk/R2/Upstash/Turnstile deployment.
Security policy: `docs/decisions/M6-5-2-PRODUCTION-SECURITY.md`. Env details:
`docs/runbooks/SECURITY-SERVICES.md`.

> ⚠️ The entire M2→M6.5.2 implementation is currently **uncommitted** on branch
> `feat/m2-publishing` (HEAD is still at the M1 commit `174a226`). It must be
> committed before any deployment. Secret review is CLEAN (no `.env*` or secret
> ever tracked/committed; `.env.local` is gitignored).

## Branch strategy

- `main` → production (foliovanta.com).
- `dev` → development/testing (dev.foliovanta.com).
- Feature branches off `dev` → PR into `dev` → test on the dev deployment →
  promote `dev` → `main` by PR. Hotfixes off `main`, merged back to `dev`.

### Recommended commands (RUN ONLY AFTER APPROVAL — do not push unprompted)

```bash
# From the repo root, with all current work intended for the dev line:
git checkout -b dev                     # create dev from the current working tree
git add -A                              # .env.local stays ignored; verify with: git status
git status                              # CONFIRM no .env* or secrets are staged
git commit -m "feat(m2-m6): publishing, templates, media, SEO, admin suite (M2–M6.5.2)"
git push -u origin dev                  # publish dev (origin already set)

# Promote to production when ready:
git checkout main && git merge --ff-only dev   # or via a reviewed PR on GitHub
git push origin main
```

Do not force-push or rewrite `origin/main` history. If a single giant commit is
undesirable, split into logical commits before pushing (history is local-only
until the first push).

## Vercel architecture — recommendation: **Option A (single project)**

| Criterion | A: one project (main=prod, dev=preview w/ domain) | B: two projects |
|---|---|---|
| Env isolation | Production vs Preview env scopes (prod providers never in Preview) | Hardest (separate namespaces) |
| Custom domains | foliovanta.com on Production; dev.foliovanta.com pinned to the `dev` branch | one domain each |
| Branch tracking | automatic (Production=main, all others=Preview) | manual per project |
| Env variables | one place, scoped | duplicated |
| Security | Preview protection + strict mode | strongest separation |
| Cost | lower | higher |
| Ops simplicity | simplest | more overhead |

**Choose A:** Vercel's Production/Preview env scoping already isolates production
from development providers (set prod provider values ONLY in Production scope;
dev/testing provider values in Preview scope), satisfying "production never uses
dev services". Pin `dev.foliovanta.com` to the `dev` branch. All feature-branch
previews share the Preview (testing) provider set — acceptable. Move to B later
only if separate access/billing/hard isolation is required.

Caveat to enforce: because every non-main branch is a Preview, never place
production secrets in the Preview scope.

## Environment matrix

| Variable | Public? | Production value | Dev/Preview value |
|---|---|---|---|
| `APP_ENV` | no | `production` | `staging` (→ both strict) |
| `NEXT_PUBLIC_APP_URL` | yes | `https://foliovanta.com` | `https://dev.foliovanta.com` |
| `SECURITY_MODE` (optional) | no | unset (derived strict) | unset (derived strict) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | prod Clerk | dev Clerk |
| `CLERK_SECRET_KEY` | no | prod Clerk | dev Clerk |
| `NEXT_PUBLIC_CLERK_SIGN_IN/UP*` | yes | same routes | same routes |
| `CLERK_WEBHOOK_SIGNING_SECRET` | no | prod webhook | dev webhook |
| `DATABASE_URL` / `DIRECT_URL` | no | prod Neon | **isolated** dev Neon |
| `R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | no | prod bucket | testing bucket |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | prod Redis | testing Redis |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | yes | prod widget | dev widget |
| `TURNSTILE_SECRET_KEY` | no | prod secret | dev secret |
| `TURNSTILE_EXPECTED_HOSTNAME` (optional) | no | `foliovanta.com` | `dev.foliovanta.com` |
| `ANTISPAM_SALT` | no | prod salt | dev salt |
| `MEDIA_CLEANUP_SECRET` | no | prod secret | dev secret |

Only `NEXT_PUBLIC_*` are browser-exposed. Never set server secrets as public.

## Database migration workflow

- Build does **not** mutate schema: Vercel runs `pnpm install` (→ `postinstall:
  prisma generate`, client only) then `pnpm build` (`next build`). No `migrate`,
  no `db push`, no reset at build.
- Apply migrations deliberately against the target DB's DIRECT_URL:
  `pnpm exec prisma migrate deploy --config prisma7.config.ts` — committed
  migrations only. Run it as a single controlled step (one operator or one CI
  job), never concurrently from multiple deploys. Apply to the isolated dev Neon
  first, verify, then production.
- `prisma migrate status --config prisma7.config.ts` must be clean before/after.
- **Never** `prisma db push` or `migrate reset` in production.
- Backups/rollback: Neon branch/point-in-time restore is the recovery path;
  forward-only migrations mean a bad migration is fixed by a new corrective
  migration, not a down-migration. Take a Neon backup/branch before applying.

## DNS / domains

1. Vercel → Project → Domains: add `foliovanta.com` (+ `www` redirect) to
   Production and `dev.foliovanta.com` pinned to the `dev` branch.
2. At the DNS registrar, point apex `foliovanta.com` per Vercel (A/ALIAS) and
   `dev` as a CNAME to Vercel. TLS is automatic.
3. Clerk → allowed origins + redirect URLs: add both `https://foliovanta.com`
   and `https://dev.foliovanta.com` (sign-in/up + fallback redirects).
4. Cloudflare Turnstile widget hostnames: add both domains.
5. Clerk webhook endpoint(s) → `/api/webhooks/clerk` on each domain, with the
   matching `CLERK_WEBHOOK_SIGNING_SECRET` per environment.

No wildcard/subdomain portfolio routing — public portfolios are path-based
(`/{publicSlug}/{username}`).

## CI/CD & branch protection

CI (`.github/workflows/ci.yml`) runs on PRs and pushes to `main`/`dev`: install
(frozen lockfile) → prisma generate → next typegen → eslint (max-warnings 0) →
typecheck → prettier check → unit tests → build. Guarded integration tests are
not in CI (no DB secret) — run locally/opt-in with `RUN_DB_INTEGRATION_TESTS=1`.

Recommended GitHub branch protection (configure in GitHub settings — human
action): protect `main` (require PR, require the `quality` check green, ≥1
review, no force-push); protect `dev` similarly (lighter review). Vercel's Git
integration deploys `main`→Production and `dev`→its domain automatically on merge.

## Deployment checklist

1. Commit all work; `git status` shows no `.env*`/secrets staged.
2. Create/push `dev`; open PR flow; CI green.
3. Create the Vercel project, connect the repo, set Production + Preview env vars
   per the matrix (no prod secrets in Preview).
4. Provision Neon (prod + isolated dev), Clerk (prod + dev), R2 (prod + testing),
   Upstash (prod + testing), Turnstile (prod + dev) — see SECURITY-SERVICES.md.
5. Apply `prisma migrate deploy` to dev Neon, verify status, then production.
6. Configure domains + DNS + Clerk origins + Turnstile hostnames.
7. Deploy `dev`; run `pnpm verify:upstash` / `verify:turnstile` against dev;
   browser-accept the anonymous report flow in strict mode.
8. Promote to `main`; production smoke test (safe diagnostics, no outage
   injection) per the M6.5.2 ADR.

## Blockers requiring human action

Provider provisioning + Vercel project + DNS + GitHub branch protection + the
first push/commit all require operator credentials/approval and are **not**
performed here.
