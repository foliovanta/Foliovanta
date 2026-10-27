# Foliovanta — Technical Requirements Document (TRD)

> **Product:** Foliovanta  
> **Tagline:** Your story. Your work. Your identity.  
> **Document:** `TRD.md`  
> **Version:** 1.0 — technical design baseline  
> **Date:** 21 October 2026  
> **Status:** Architecture specification for review; not an implementation or validation report  
> **Primary input:** `PRD.md` v1.0  
> **Companion documents:** `APP_FLOW.md`, `UI_UX_DESIGN_BRIEF.md`, `BACKEND_SCHEMA.md`, `IMPLEMENTATION_PLAN.md` (planned)

---

## 1. Purpose, authority, and decision language

This TRD translates the Foliovanta PRD into engineering requirements, system boundaries, data flows, integration contracts, quality gates, and operational controls for a **real, publicly shipped multi-tenant SaaS**. It is intended for frontend, backend, database, infrastructure, QA, security, and product review. The PRD governs *what and why*; this TRD governs *how and under what engineering constraints*. The forthcoming Backend Schema document owns exact Prisma definitions and SQL migrations; the Implementation Plan owns sequencing and task estimates. If requirements conflict, record the conflict and resolve it explicitly rather than silently changing product behavior.

**Decision labels:** **Agreed** = established architectural direction; **Baseline** = recommended technical convention adopted for design, subject to verification; **Proposed** = needs product/engineering approval; **Open** = unresolved; **Future** = outside MVP. **Verified** may be used only when an executable test or real integration has demonstrated the claim. Nothing in this document is marked Verified as of its publication.

**Core invariants (non-negotiable):** (1) Users cannot read or mutate another user's private portfolio; (2) public pages never read unpublished draft content; (3) a successful autosave acknowledges a committed mutation; (4) stale revisions cannot silently overwrite newer work; (5) publication atomically activates a complete immutable snapshot; (6) moderation/account restrictions override publication; (7) template changes never delete canonical content; (8) privilege is verified server-side on every protected operation; (9) critical changes are observable and recoverable; (10) usage quotas are server-enforced and not encoded as fixed content columns.

### 1.1 Scope

MVP includes marketing and template discovery, Clerk authentication, onboarding, one portfolio per account, structured editing, three templates, design controls, autosave/preview, publish/unpublish/version history/rollback capability, hosted public subdomains, media, SEO, user settings, feedback, Super Admin moderation and audit, baseline analytics, CI/CD, monitoring, security and recovery. Out of MVP: billing, custom domains, collaboration, arbitrary page building, external public API, mobile native apps, multiple portfolios per account, AI authoring, multilingual authoring, advanced user analytics, real-time in-app notifications.

### 1.2 Requirements traceability

PRD groups map as follows: AUTH/ONB → §§5–6; DASH/EDIT/SAVE → §§7–9; TPL/DESIGN → §10; PUB/VER → §11; PUBLIC/SEO → §§12–13; MEDIA → §14; ADMIN/REPORT/FEEDBACK → §15; NOTIFY → §16; ANALYTICS → §17; SEC/PRIVACY → §18; NFR/OPS → §§19–23. Exact endpoint IDs and data-model IDs will be cross-linked in `BACKEND_SCHEMA.md` and the API contract catalog. Each implementation ticket must cite at least one PRD requirement and one TRD subsection.

## 2. Architecture decisions and technology inventory

| Layer / responsibility | Selected technology or approach | Status | Implementation rule |
|---|---|---|---|
| Application | Next.js 16 App Router, React, TypeScript | Agreed | Single deployable modular monolith |
| Hosting | Vercel | Agreed direction / PoC open | Verify wildcard hostname, TLS, caching, functions and limits |
| UI | Tailwind CSS, shadcn/ui, Radix | Agreed | Platform UI separate from portfolio template tokens |
| Icons / toast | Lucide React / Sonner | Baseline | Do not use toast as sole autosave indicator |
| Browser API transport | Native `fetch` + typed wrapper | Agreed ADR-002 | No token storage/interceptor framework required |
| Server state | TanStack Query | Agreed ADR-002/003 | Scoped keys, safe invalidation, session cache isolation |
| Forms | React Hook Form + Zod resolver | Agreed ADR-003 | Form owns active unsaved inputs |
| Shared editor UI state | Selective Zustand | Agreed ADR-003 | No duplicate authoritative draft store |
| URL state | `nuqs` selectively | Baseline | Only for navigable/filterable state |
| Drag/reorder | dnd-kit | Baseline | Accessible keyboard alternative |
| Authentication | Clerk, managed browser sessions | Agreed ADR-006 | Do not implement custom JWT refresh flow |
| Authorization | DB-backed role + resource policies | Agreed | Server-side, deny by default |
| Persistence | Neon PostgreSQL + Prisma | Agreed | SQL constraints for invariants Prisma cannot model |
| Object storage | Cloudflare R2 | Agreed | Private/signed uploads; verified ownership |
| Media tooling | S3-compatible SDK; Sharp if processing required | Baseline | Verify file content, not just MIME header |
| Public rendering | Shared typed template registry + SSR | Agreed | Published snapshot only on public hostname |
| Design system | Validated token resolver + CSS variables | Agreed | No arbitrary user CSS/JS |
| Analytics | GA4 + PostgreSQL business events | Agreed | Consent-aware, deduplicated, no PII in GA4 |
| Error tracking | Sentry | Agreed | Sensitive data scrubbing |
| Testing | Vitest, RTL, Playwright | Agreed | PostgreSQL integration tests for critical transactions |
| CI | GitHub Actions | Agreed direction | Merge gates and isolated deployment environments |
| Email | Clerk auth emails; Resend + React Email for app email | Proposed | Introduce only with a defined transactional email use case |
| Background work | Transactional outbox; provider TBD | Baseline / Open | Do not assume serverless request completion is a queue |
| Rate limiting | Managed durable rate-limit store where needed | Proposed | Avoid in-memory-only production limits |
| Bot defense | Turnstile on selected abuse-prone endpoints | Proposed | Not a replacement for authorization/rate limiting |
| Rich text | Plain text or constrained Tiptap | Open | Decide before content schema is locked |

**Deliberately not required in MVP:** separate NestJS/Fastify service, Redux, Axios, tRPC, Redis as general cache, Kafka, BullMQ, generic page builder, realtime socket platform, microservices. Introduce only against an explicit requirement, benchmark, or ADR.

### 2.1 Architecture Decision Record index

- **ADR-001:** Single Next.js modular monolith with strict backend domain boundaries — agreed.
- **ADR-002:** Native fetch + TanStack Query + Route Handlers for complex browser mutations; direct server services for server-rendered reads — agreed.
- **ADR-003:** React Hook Form + Zod + selective Zustand; revision-aware autosave coordinator — agreed.
- **ADR-004:** Sonner, Clerk authentication email, optional transactional email provider — proposed baseline.
- **ADR-005:** Transactional outbox for durable cross-system side effects; job provider chosen by workload — proposed baseline.
- **ADR-006:** Clerk-managed cookie/session authentication, server verification, DB-backed authorization — agreed.

Any material divergence requires a new ADR with motivation, alternatives, tradeoffs, migration implications, owner, and date.

## 3. System context and deployment topology

```text
Creator browser ─────────────┐
Public visitor browser ──────┼── HTTPS / Vercel edge + hostname routing
Super Admin browser ─────────┘                   │
                                                ▼
                                     Next.js application
                          ┌─────────────────────┼─────────────────────┐
                          ▼                     ▼                     ▼
                   React/RSC views        Route Handlers        Clerk callbacks
                          └─────────────────────┼─────────────────────┘
                                                ▼
                                   Server-only application services
                              ┌─────────────────┼─────────────────┐
                              ▼                 ▼                 ▼
                        Prisma/Neon         R2 storage       Outbox/adapters
                              │                                   │
                              └───────────────────────────────────┘
                          Sentry / logs / GA4 / operational monitoring
```

**Hostnames (design targets, not deployed facts):** `foliovanta.com` marketing + authenticated app + `/admin`; public portfolios are served **path-based** on the same origin at `foliovanta.com/{publicSlug}/{username}` (M3 — the earlier `*.foliovanta.com` wildcard scheme is superseded and no wildcard DNS is required). Domain registration, trademark clearance, TLS, Clerk allowed origins/redirects, and Vercel compatibility remain unverified.

**Public routing:** Public portfolios are resolved by the numeric `User.publicSlug` through server loaders (no host rewrite, no wildcard proxy). The Clerk middleware protects only `/dashboard` and `/editor`; public routes are unauthenticated. **Routing is not an authorization boundary**: server loaders and services independently enforce visibility. Canonical URLs are built from a validated `NEXT_PUBLIC_APP_URL`, never from forwarded Host headers. Stale usernames 307-redirect to the current canonical URL (with `rel=canonical`) so renames never create duplicate indexed URLs; non-public portfolios return a uniform 404 (no redirect, no existence leak). Preview is never publicly accessible. See `docs/decisions/M3-URL-IDENTITY.md`.

**Deployment units:** one Next.js application, one PostgreSQL database per environment, logically separate R2 buckets/prefixes per environment, isolated Clerk environment/keys, isolated GA4 and Sentry configurations. No shared production secrets or writable production DB from preview deployments. Environment-specific webhook destinations and redirect URLs must be configured explicitly.

## 4. Codebase and module boundaries

```text
src/
  app/
    (marketing)/  (auth)/  (onboarding)/  (dashboard)/
    (editor)/  (publishing)/  (settings)/
    (public-portfolio)/  admin/  api/
  features/
    auth/ users/ onboarding/ portfolios/ editor/ templates/
    design/ publishing/ media/ seo/ analytics/ feedback/
    reports/ moderation/ admin/ notifications/
  components/ui/  components/shared/  components/layouts/
  lib/
    db/ auth/ permissions/ api/ tenant/ storage/ env/ logging/
  config/  types/  proxy.ts
prisma/  tests/{unit,integration,e2e}/  docs/{architecture,decisions}/
```

Route groups are organizational and do **not** create URL segments. The exact Next.js route tree must be checked for collisions, especially marketing root and wildcard public rewrites. This tree is conceptual, not a ready-to-run routing implementation.

**Dependency direction:** UI → hooks/queries → transport → application services → repositories/adapters. Server Components may call application services directly. Domain services must not import React, `next/navigation`, or HTTP request/response objects. Repository implementations may import Prisma; UI and client modules must not. Mark server-only modules using `server-only`, enforce import boundaries through lint/build checks, and prohibit secret-bearing modules in client bundles. Avoid speculative abstractions: use a repository interface where testing, transactions, or provider substitution actually benefit.

**Feature module conventions:** `components`, `schemas`, `services`, `repositories`, `queries`, `mutations`, `types`, `constants` only where needed. Shared code must have clear ownership. Prevent circular dependencies and feature-to-feature direct repository access; orchestrate cross-feature workflows in application services.

## 5. Identity, sessions, authorization and account lifecycle

### 5.1 Clerk integration

Use Clerk-managed Google and email/password sign-in. Clerk owns authentication credentials, session establishment, expiration, revocation, email verification, and account identity; our app must not persist raw passwords, session tokens, or refresh tokens in localStorage/Zustand. Browser requests use Clerk-supported same-origin session behavior. The server obtains verified identity via Clerk's supported Next.js SDK; never decode an unverified token as proof of identity. Do not hardcode assumptions about cookie names, JWT shape, or refresh implementation.

**Request sequence:** browser → authenticated Next.js endpoint → verified Clerk user ID → internal `User` lookup → status/role validation → resource-level permission check → service operation. Public portfolio requests are anonymous and use publication visibility rules.

**Provisioning:** Clerk webhooks are verified for authenticity and processed idempotently. A first-authenticated-request reconciliation path must handle delayed, missed, or out-of-order webhook delivery. Store `clerkUserId` unique; store only necessary profile data. Define user creation/upsert behavior and ensure a disabled/deleted internal user cannot regain access merely by possessing a valid Clerk session.

**CSRF/session security:** For cookie-authenticated state-changing requests, apply Clerk's supported protections and server-side origin checks where applicable; maintain secure HTTPS, same-origin API calls, restrictive CORS, and explicit allowed redirect origins. `SameSite` alone is not a complete CSRF strategy. Validate webhook signatures independently of browser sessions.

### 5.2 Authorization

Internal roles: `USER`, `ADMIN` if operationally needed, `SUPER_ADMIN`. **Default is USER**; role promotion requires a privileged, auditable server-side process. Never trust a role sent by the client. Prefer explicit policy functions (`canEditPortfolio`, `canPublishPortfolio`, `canModeratePortfolio`, `canViewAuditLogs`) over scattered string comparisons. Policies check identity, ownership, account status, portfolio state, and operation context. All administrative reads and writes must be checked in the service layer; `/admin` layout guards improve UX but are insufficient alone.

| Actor / operation | Own draft | Other draft | Own publish | Public published | Moderate | Audit logs |
|---|---:|---:|---:|---:|---:|---:|
| Anonymous | No | No | No | Yes, if eligible | No | No |
| Active owner | Yes | No | Yes | Yes | No | No |
| Suspended/disabled owner | Policy-limited | No | No | Public eligibility rules | No | No |
| Super Admin | Scoped privileged access, logged | Only where authorized and audited | Administrative action only | Yes | Yes | Yes |

Super Admin access to private drafts must be intentionally defined and audited, not assumed as an unrestricted default. Cross-tenant tests must cover guessed IDs, changed URL params, media keys, version IDs, and ownership changes.

### 5.3 Account lifecycle

Track internal account states (`ACTIVE`, `DISABLED`, `PENDING_DELETION`, `DELETED` or equivalent). Define verified-email prerequisite for publishing. Deletion must immediately revoke access and public eligibility, schedule retention-aware erasure of DB/R2/Clerk data, and respect required audit/legal retention. Exact recovery grace period and retention policy remain **Open**. Session change/logout must clear user-scoped TanStack Query caches and any sensitive editor recovery data.

## 6. Onboarding and account bootstrap

Steps: persona → profile → education/experience/skills → projects → template selection, with permitted skips and resume. A successful signup creates or reconciles an internal user; portfolio creation is an idempotent operation. Enforce one active portfolio per user in MVP **in a concurrency-safe manner**; because the underlying schema should support multiple portfolios later, use a transactional entitlement/creation guard rather than permanently relying on `UNIQUE(ownerId)` if that would block expansion. Exact database enforcement mechanism is specified in Backend Schema.

Persist onboarding progress server-side, not solely in browser memory. Validate persona values and all fields; persona influences defaults but does not restrict sections/templates. Generate unique slugs with reserved-name protection and atomic collision handling. Minimum publish-ready fields are **Open**; proposed baseline: verified identity, display name, valid slug, selected compatible template, valid required configuration. Missing optional onboarding data must not prevent saving drafts.

## 7. Dashboard, settings and navigation

Dashboard reads authenticated portfolio summary, current draft revision, active published version, publication/moderation state, last saved time, public URL, and actions (edit, preview, publish/unpublish, settings, feedback). Use server rendering for initial private reads and TanStack Query for interactive refresh. Avoid leaking private data through shared caches. Account settings include profile, account deletion request, and session actions. Portfolio settings include slug display, SEO controls, publication status, and version history. Route inventory is owned by `APP_FLOW.md`; proposed URLs in PRD are not binding until route design review.

Navigation must not discard unsaved editor changes. Show actionable error states and status; loading and empty states must be accessible. Use URL state only for shareable navigation/filter state, not for credentials or unsaved content.

## 8. API architecture and contracts — ADR-002

### 8.1 Transport selection

**Browser:** native `fetch` through a small typed client; TanStack Query manages queries/mutations, cache and invalidation. **Server Components:** direct application-service calls (no self-HTTP). **Mutations:** Route Handlers by default for editor CRUD, autosave, publishing, media signing, feedback and admin actions. **Server Actions:** optional for simple form flows when they preserve the same service boundary. **Webhooks:** dedicated verified Route Handlers.

The client wrapper must: serialize JSON only when appropriate; handle 204/empty responses; normalize non-2xx errors; preserve `AbortSignal`; propagate request IDs; avoid logging secrets; support explicit timeouts; distinguish network/abort/validation/conflict errors. TypeScript generics do not perform runtime validation. Zod validates all untrusted input and critical external responses. Do not set JSON `Content-Type` on multipart/binary requests.

### 8.2 Response/error contract

Successful reads return typed JSON resources; successful creates use 201; no-body mutations use 204 when appropriate. Error envelope:

```ts
type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
};
```

Map: 400 malformed input, 401 unauthenticated, 403 forbidden, 404 not found (including masked unauthorized resources where appropriate), 409 revision/idempotency conflict, 413 oversized payload, 422 semantic validation where chosen, 429 rate limited, 500 sanitized unexpected failure, 503 transient dependency failure. Define one consistent 400/422 policy in the API catalog. Validation details must be safe to expose; never return stack traces, SQL, storage credentials, or provider internals. Log errors with correlation IDs and redact sensitive fields.

### 8.3 Proposed endpoint inventory (contracts to be finalized in WP-03)

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/me` | Current internal account | User |
| GET/POST | `/api/portfolios` | List/create portfolio, quota checked | User |
| GET | `/api/portfolios/:id` | Owner portfolio summary | Owner |
| GET | `/api/portfolios/:id/draft` | Canonical draft + revision | Owner |
| PATCH | `/api/portfolios/:id/draft` | Revision-aware autosave patch | Owner |
| POST | `/api/portfolios/:id/publish` | Atomic publish | Owner |
| POST | `/api/portfolios/:id/unpublish` | Hide public version | Owner |
| GET | `/api/portfolios/:id/versions` | Version history | Owner |
| POST | `/api/portfolios/:id/rollback` | Activate prior version | Owner |
| POST | `/api/media/upload-intents` | Create signed upload intent | User + ownership |
| POST | `/api/media/:id/complete` | Verify and finalize asset | Owner |
| POST | `/api/feedback` | Product feedback | Policy-defined |
| POST | `/api/reports` | Abuse report | Policy-defined |
| GET/PATCH | `/api/admin/users` | Admin user management | Super Admin |
| GET/PATCH | `/api/admin/portfolios` | Admin moderation | Super Admin |
| GET | `/api/admin/audit-logs` | Audit access | Super Admin |
| POST | `/api/webhooks/clerk` | Verified identity events | Signed webhook |

These are **proposed API shapes**, not implemented endpoints or approved REST semantics. Section-specific endpoints vs one typed draft patch, pagination details, and webhook routes require WP-03 review. For public rendering prefer direct server service calls rather than an unnecessary public JSON API.

### 8.4 Idempotency, caching, retries

Client mutation IDs identify autosave attempts; same ID + same request fingerprint returns the original committed result; same ID + different payload is rejected. Publishing/unpublishing/rollback need idempotency policy as well. Only retry mutations automatically when retry safety is proven. Read retries should be bounded and avoid retrying 4xx. Scope query keys by authenticated identity and portfolio; clear private cache on session change. Avoid storing private data in shared CDN caches. No externally consumed versioned API is committed for MVP; version the published snapshot schema from day one.

## 9. Editor state, autosave, concurrency and preview — ADR-003

### 9.1 State ownership

| State | Authoritative owner | Client projection |
|---|---|---|
| Persisted draft | PostgreSQL | TanStack Query last acknowledged draft |
| Current field edits | React Hook Form | Active form inputs |
| Editor UI mode | React local state / selective Zustand | Selected section, panel, viewport |
| Pending writes | Dedicated autosave coordinator | Queue, dirty keys, request IDs |
| Revision | PostgreSQL | Last acknowledged revision |
| Public content | Immutable `PortfolioVersion` | Public renderer only |

Do **not** keep independently writable full drafts in RHF, Zustand, and TanStack Query. Preview derives from last acknowledged draft plus local unacknowledged edits plus validated design configuration; it must never contaminate server-state cache with unsaved content.

### 9.2 Autosave protocol

Initial debounce target ~800 ms (**tunable**). One in-flight mutation per portfolio draft; coalesce subsequent edits without losing the distinction between acknowledged and unacknowledged fields. Each request includes `expectedRevision`, `mutationId`, and a validated typed patch. Server transaction conditionally advances revision and updates content atomically. A stale expected revision returns `409 DRAFT_REVISION_CONFLICT`; do not auto-overwrite the server. After acknowledgement, update the last acknowledged revision, preserve any newer local edits, and flush remaining changes. An acknowledged save means the transaction committed.

**Critical invariant:** Client A and client B both load revision 7; A commits revision 8; B's revision-7 mutation cannot commit. If the response to A is lost, retrying A's same mutation ID returns the original result rather than applying it twice. Transactional idempotency record must include actor, portfolio, fingerprint, outcome, and retention policy.

**Concurrency implementation:** conditional portfolio revision increment and all relational writes occur in one transaction. Revisions are portfolio-wide, not per section. The server should verify ownership inside the same transactional operation, and implement transaction retry for documented database serialization/deadlock errors with bounded attempts. Do not assume `upsert` alone provides the required business idempotency semantics.

### 9.3 Editor status state machine

`SAVED → DIRTY → SAVING → SAVED`; on transient failure `SAVING → ERROR` (retain dirty state); on lost network `DIRTY/SAVING → OFFLINE` (retain edits); on stale revision `SAVING → CONFLICT` (stop blind retries); on recovery resolve/reload/merge deliberately. Display persistent status with accessible announcements; toasts are supplementary. If a form unmounts on section navigation, pending changes must be transferred to a coordinator that outlives the form.

**Recovery:** normal in-app navigation must not lose edits; browser/tab crash recovery via persistent local drafts is a proposed P1 capability and requires an explicit privacy, encryption/storage, TTL and schema-version policy. Browser `beforeunload` cannot guarantee delivery. Warn on navigation when unsaved work may be lost. `BroadcastChannel` can announce same-user tab activity, but **database revisions remain authoritative**.

### 9.4 Conflict UX

On 409: preserve local patch; fetch latest server draft/revision; show a conflict state. For disjoint edits, a carefully validated rebase may be offered; for overlapping edits, require user choice or explicit resolution. Do not silently last-write-wins. Log conflict rates without logging portfolio content. Reordering operations should use stable record IDs and server-validated positions; do not rely on array indices as identities.

### 9.5 Publishing barrier

Click Publish → freeze duplicate publish actions → validate current editor state → flush pending writes → wait for committed revision → reject if save error/conflict → send `expectedRevision` and idempotency key → server validates revision and constructs snapshot transactionally. A publish endpoint must **not** assume the browser has flushed successfully merely because it sent a publish request. Server checks authoritative revision independently.

## 10. Canonical content, templates and design tokens

### 10.1 Canonical draft content

Relational draft entities: PortfolioProfile, PortfolioSection, Project, Experience, Education, Skill, Certification, SocialLink, PortfolioDesign and optional settings. One-to-many relationships permit arbitrary numbers of entries without schema alteration; product entitlements and operational quotas bound resource use. Do not create numbered `project1`/`project2` columns or fixed arrays in the DB. New *kinds* of sections may require schema changes unless introduced through a separately specified extensible section system. For MVP, supported section types are explicitly enumerated.

Content fields must have explicit Zod validation, maximum lengths, URL protocol allowlists, optionality and rendering rules. Avoid storing arbitrary HTML. Rich text is **Open**: plain text baseline or restricted Tiptap with a versioned, sanitized structured document schema; choose before final schema and renderer contracts. Section visibility and ordering are separate from content records so hiding a section does not delete its data.

### 10.2 Template registry

Initial templates: **Minimal**, **Professional**, **Creative**. Each registry entry defines stable template ID, semantic template version, supported snapshot schema versions, section renderers, supported design tokens, default values, supported layout variants, and fallback behavior. Template switching changes presentation config only, never canonical content. Template IDs/versions in published snapshots must resolve to compatible renderer code; unsupported snapshots must not render corrupted content silently.

Use one renderer contract for gallery sample, editor preview and published site, with different *data sources* and privacy boundaries. Preview may use draft projections; public uses only active published snapshot. Rendering should be deterministic for a given snapshot/template version within a deployment. Maintain compatibility fixtures for old snapshots and run them in CI before deleting legacy template code.

### 10.3 Design configuration

Curated palette + validated custom colors; curated heading/body fonts; supported light/dark modes, spacing, radius, card/button variants, responsive section layouts. Resolve defaults + template constraints + user overrides through a typed design-token resolver, then emit safe CSS custom properties. Never interpolate arbitrary CSS or JavaScript from user content. Validate color syntax and accessibility contrast; warn or constrain invalid combinations. Font choices must use an approved registry; no arbitrary remote font injection. Exact token matrix is **Open** and belongs in UI/UX brief plus template technical spec.

### 10.4 Performance and accessibility

Template components should prefer server rendering and minimal client JavaScript. Interactive effects must respect reduced-motion preferences. Use semantic headings/landmarks, keyboard-accessible navigation, focus visibility, alt text and WCAG 2.2 AA target. Images have responsive sizing, aspect-ratio rules and meaningful placeholders. No template may assume desktop-only viewport widths.

## 11. Publishing, version history and rollback

### 11.1 Data model and invariants

`Portfolio` owns current draft revision and optional active `publishedVersionId`. `PortfolioVersion` holds immutable complete JSON snapshot, `schemaVersion`, `templateId`, `templateVersion`, `sourceDraftRevision`, version number, content hash, actor and timestamp. A composite relationship or equivalent database-enforced constraint must ensure active version belongs to the same portfolio. Publication state and moderation state are independent; owner status also affects public eligibility. Public code never joins mutable draft records to render content.

### 11.2 Atomic publish algorithm

Within a transaction: authorize actor and owner eligibility; lock/serialize publish per portfolio; verify expected revision; load a consistent draft; validate required fields, quotas, asset readiness and template compatibility; build canonical snapshot; allocate unique monotonically increasing version number; insert immutable version; atomically set active version/publication status; write audit/outbox events; commit. Cache invalidation and noncritical integrations run after commit and are retriable. Failure leaves the previous public version active. Ensure database transaction duration is bounded: avoid network calls to Clerk/R2 inside long-lived DB transactions; perform safe preliminary checks outside, re-check necessary invariants inside.

**Snapshot consistency:** transaction isolation/locking must ensure the content rows correspond to the revision checked; draft writers and publisher must serialize on the same portfolio row or use an equivalent isolation scheme. Merely reading `draftRevision` before a series of unprotected reads is insufficient.

### 11.3 Unpublish, rollback, moderation

Unpublish removes public eligibility without deleting draft/history. Rollback atomically points to an existing, compatible version owned by the portfolio and writes audit/outbox records; it does not mutate history. Suspended portfolios cannot republish through ordinary user actions. The public resolver requires eligible owner, allowed moderation state, published status and valid active version. Moderation must invalidate cached public responses urgently; design a revocation strategy that does not rely exclusively on eventually consistent CDN invalidation. Historical versions must not be available through unauthenticated version-ID URLs.

### 11.4 Snapshot compatibility

Version both **content schema** and **template renderer**. Establish an explicit compatibility matrix, migration functions where needed, and golden fixture tests for old versions. Retaining an immutable snapshot does not guarantee renderability if its renderer is removed. Define policy for version retention and asset reference preservation before launch. Version history/rollback UX timing is a product release-sequencing question; the underlying capability is required by PRD.

### 11.5 Side effects and failure recovery

Use durable transactional outbox records for critical publish/unpublish/moderation events; workers must be idempotent, retry with bounded backoff, and expose failures. Choose actual queue/provider after assessing volume and Vercel execution constraints. If public cache purge fails, retain retryable event and surface operational alert; no unverified claim of instantaneous global invalidation. Include operational controls to disable public visibility at origin while edge cache strategy is being repaired.

## 12. Public routing, caching and SEO

Public URL design (M3): `https://foliovanta.com/{publicSlug}/{username}`. `publicSlug` is an immutable, unique, sequence-generated numeric `User` id (allocated by a Postgres sequence; a DB trigger forbids changes); `username` is an editable, normalized, **non-unique** URL label. Identity is resolved only by `publicSlug`, never by username. The legacy `/p/{slug}` route and stale usernames 307-redirect to the canonical URL when publicly visible. No wildcard DNS/TLS is required. Unknown/invalid slugs return real 404; unpublished/suspended/deleted cases return a uniform 404, not 200 with an error page. Do not reveal private moderation reasons to anonymous visitors.

**Cache design:** Published snapshot IDs are immutable and cache-friendly; active slug→version resolution is mutable and security-sensitive. Use cache keys scoped by slug/version and an explicit invalidation policy. Authentication-only routes must be private/no-store as appropriate. For moderation, define a bounded stale-content exposure objective and test it across CDN, Next.js data caches, and browsers. Do not cache personalized private data at a public edge. For suspended content, an origin visibility check and/or short-lived active-pointer cache may be required; measure impact on latency.

**SEO:** Server-render content, Next.js Metadata API, Open Graph/Twitter cards, canonical HTTPS URL, robots/sitemap routes, JSON-LD where valid, semantic headings, alt text, indexability only for eligible published pages. Private previews, dashboard, admin, and unpublished sites are noindex and access-controlled; `robots.txt` alone is not access control. Sitemap should include only eligible public slugs and update on publish/unpublish/moderation. Implement stable metadata fallback and test link previews. Search Console configuration and domain verification are launch tasks; ranking is not guaranteed.

## 13. Rendering and client performance

Separate marketing, authenticated app and public portfolio performance budgets. Public pages should minimize hydration and ship only required client JS. Editor can be more interactive but must avoid re-rendering the entire template on every unrelated keystroke. Memoize projection boundaries where justified and benchmark large repeatable sections. Use `next/image` or compatible CDN optimization after confirming R2 delivery configuration, remote patterns, caching and image URL policy. Avoid exposing private R2 object URLs or relying on long-lived presigned URLs in published snapshots. Use immutable public media identifiers or stable delivery URLs with explicit access and retention policies.

**Proposed budgets for validation, not approved SLOs:** measure Core Web Vitals (LCP, INP, CLS) at the 75th percentile; track API p95 and editor input latency; establish maximum published snapshot bytes and maximum renderable entries after representative load tests. Numeric thresholds remain **Open** pending real benchmarks.

## 14. Media upload, processing and deletion

### 14.1 Upload flow

1. Authenticated client requests upload intent specifying portfolio, purpose, filename, expected type/size.
2. Server verifies user, portfolio ownership, quota, allowed purpose/type, rate limit; creates an `UPLOADING` media record and a short-lived, constrained R2 upload authorization.
3. Client uploads directly to R2 (S3-compatible API). Upload progress uses XHR/dedicated client only where native fetch lacks the required progress semantics.
4. Client signals completion; server checks object existence, actual size and content, image decode, dimensions, checksum/metadata, and ownership; optionally normalizes/processes image.
5. Server marks `READY` only after verification. Rejected uploads become `REJECTED`; incomplete intents expire and are cleaned up.
6. Editor may attach only `READY` assets owned by the permitted actor/portfolio.

Do not trust file extension, claimed MIME type, client-provided dimensions, or an R2 key passed in a patch. Reject unsupported formats, oversized files, decompression bombs and unsafe content; strip unnecessary EXIF where processing. Set content disposition and safe content type on delivery. Storage keys must be opaque and non-guessable; public display uses approved delivery URLs, not writable object paths. Signed upload URLs should be short-lived and scoped to a single object and operation.

### 14.2 Quotas and references

Enforce file count, total storage bytes, individual upload size, per-user/portfolio media quotas, and allowed dimensions using server-side transactional reservations or equivalent race-safe accounting. Exact values **Open**. Removing an image from draft does not imply safe deletion: published versions may still reference it. Track references or derive them through a controlled index; garbage-collect only when no retained draft/version references remain, after grace period. R2 deletion is idempotent/retriable and auditable. Account erasure must coordinate DB metadata, stored objects, historical snapshots and backups.

## 15. Super Admin, moderation, feedback and abuse reports

Super Admin lives within the same Next.js app at `/admin` with separate layout, server-side SUPER_ADMIN enforcement, and resource-scoped services. MVP capabilities: user list/detail/status, portfolio list/detail/status, report queue, feedback queue, moderation action history, audit log access and basic operational overview. Advanced analytics dashboard is future. Admin queries must use pagination, filters, bounded exports, and explicit projection of sensitive fields. High-impact actions (suspension, account disable, deletion) require confirmation, audit and cache invalidation.

**Moderation state machine:** `CLEAR`, `UNDER_REVIEW`, `SUSPENDED` (exact transitions to be specified). Only authorized admins can change it; every change records actor, target, reason code, timestamp and previous/new status. Suspension overrides publication state. Feedback and abuse reports require input validation, rate limits, spam controls and privacy-aware handling; public abuse reporting may be anonymous only after a product decision. Reporter identity and report details are not public.

Audit logs must be append-oriented, tamper-resistant to ordinary users, access-controlled, retention-governed, and never contain credentials or raw session tokens. Separate operational events from GA4 events; an analytics failure must not prevent moderation or publishing.

## 16. Notifications, email and background execution

**UI feedback:** Sonner for transient success/error toasts; persistent inline state for autosave and conflicts. **Authentication email:** Clerk. **Application email:** Resend + React Email is proposed when invitations, publish notifications or support receipts become product requirements; verify sending domain, SPF/DKIM/DMARC and unsubscribe rules for non-transactional mail. **Operational alerts:** Sentry/monitoring provider. Persistent notification inbox, realtime push, and browser push are future.

**Durable asynchronous work:** Database transaction writes an outbox event with unique event ID, type, aggregate ID, payload schema version, timestamp and delivery state. A worker claims records safely, processes idempotently, retries transient failures, and exposes poison events for investigation. The worker/provider and polling/scheduling mechanism are **Open**; a request handler's unawaited promise is not a durable queue. Define max attempts, backoff, dead-letter policy, and alert thresholds in the implementation specification. Avoid storing unnecessary personal data in event payloads.

## 17. Analytics and instrumentation

**GA4:** Client/public engagement analytics with explicit tenant context where appropriate; do not send names, emails, free-text biographies, or other PII. Respect consent requirements and supported consent mode where legally required. **Database business events:** Authoritative events for signup, onboarding progress, template selection, autosave errors/conflicts, publish, unpublish, rollback, portfolio view (with deduplication/bot filtering policy), contact click, feedback and moderation. Instrument server-side business outcomes only after successful transaction. Client analytics can supplement but not replace authoritative events. Event definitions need stable names, schema versions, actor/portfolio context, idempotency keys and retention policy.

**Observability vs analytics:** Sentry tracks failures; structured logs support incident investigation; audit logs track privileged changes; business events track product outcomes. These are separate systems with different privacy/retention guarantees. Super Admin advanced analytics is future, but MVP should collect the minimum events required to support it later.

## 18. Security, privacy and threat model

### 18.1 Trust boundaries

Untrusted: browser input, route params, cookies/headers until verified, webhook bodies until signature verification, file bytes, external URLs, rich text, query parameters, user-configured colors and hostnames. Trusted only after validation: Clerk session identity, server policy decision, validated DTOs, database constraints, verified media metadata. Do not rely on TypeScript types for runtime trust.

### 18.2 Required controls

- Verify session and account status on protected requests; resource ownership and role per operation.
- Apply Zod and strict size limits to payloads; reject unexpected keys where appropriate.
- Parameterize DB access through Prisma; use least-privilege database credentials and controlled migrations.
- Validate external URLs (`https:`/approved schemes), protect against `javascript:`/unsafe embeds, escape rendered text; sanitize constrained rich text if adopted.
- Define CSP, security headers, secure cookies, CORS/origin policy, HTTPS and trusted hostname handling.
- Use rate limiting on login-adjacent flows, portfolio creation, publishing, uploads, feedback and reports; key by actor and/or privacy-safe IP signal as appropriate.
- Keep secrets server-side, rotate credentials, separate environments, avoid secrets in logs/client bundles.
- Verify Clerk webhook signatures, event IDs and replay behavior; tolerate out-of-order delivery.
- Validate media bytes and ownership; constrain presigned upload scopes and expirations.
- Audit admin privilege changes and moderation; minimize privileged access.
- Implement account deletion, data minimization, retention and user-data access policy.
- Avoid publishing private draft content through metadata, cache, logs, previews or OG image generation.

### 18.3 Abuse cases and mandatory tests

Cross-user draft GET/PATCH; forged portfolio/version IDs; slug collision/race; malicious custom color/CSS injection; XSS via biography/project URL; webhook replay; upload URL replay and object substitution; oversized/decompression-bomb images; quota race; CSRF on cookie-backed mutation; unauthorized Super Admin endpoint; suspended portfolio still visible through stale CDN; publication during concurrent draft update; deleted user portfolio still indexed; accidental private data in GA4/Sentry. Use automated negative tests and manual threat review.

**Privacy decisions Open:** consent UX by jurisdiction, retention periods, account deletion grace period, analytics IP policy, legal basis and data-processing agreements, data residency requirements. These require product/legal input; do not infer compliance from selecting vendors.

## 19. Database requirements and integrity

**Source of truth:** Neon PostgreSQL; Prisma models and migrations. UUID internal primary keys; Clerk external ID unique. Draft content is relational. Published content is immutable versioned JSON. Use timestamps with timezone, explicit foreign keys, uniqueness, check constraints, indexes and transactional writes. Do not hardcode fixed entry counts in schema; enforce configurable entitlements server-side. The exact models, enums, relationships, SQL CHECK constraints, partial indexes and deletion actions are owned by `BACKEND_SCHEMA.md`.

**Core model inventory:** User, Portfolio, PortfolioProfile, PortfolioSection, Project, Experience, Education, Skill, Certification, SocialLink, PortfolioDesign, PortfolioVersion, MediaAsset, Feedback, AbuseReport, ModerationAction, AuditLog, BusinessEvent. Additional support models likely required: DraftMutation/idempotency, OutboxEvent, OnboardingProgress, QuotaUsage/Reservation, PortfolioVersionMediaReference or equivalent, and potentially PortfolioSettings/UserPreference. The earlier 18-model inventory was a domain sketch, **not a claim that only 18 tables are sufficient**.

**Integrity requirements:**

1. Unique normalized public slug, with reserved names and atomic allocation.
2. One profile/design row per portfolio; unique section key per portfolio; stable ordering.
3. Unique `(portfolioId, versionNumber)` and same-portfolio active-version reference.
4. Nonnegative monotonically increasing draft revision.
5. All draft mutations conditionally check expected revision in same transaction as writes.
6. Idempotency uniqueness scoped to actor/portfolio/operation with payload fingerprint.
7. Media ownership and published-version references are enforceable and auditable.
8. Moderation and publication state independent; public eligibility checked on read.
9. Soft-deletion policy prevents public visibility immediately and enables eventual erasure.
10. Migrations preserve compatibility with live application instances; no destructive production migration without reviewed plan.

**One portfolio per user MVP:** product entitlement enforced atomically without permanently blocking multiple portfolios in a future plan. Consider owner-level transaction locking or a user allocation row; exact mechanism in schema design. **Quotas:** enforce with transaction-safe counters/reservations where concurrent creates/uploads could exceed limits; not a frontend-only check.

**Indexes:** by owner, slug, portfolio+position, portfolio+version, media owner/status, admin report status/time, audit actor/resource/time, event type/time. Confirm using query plans and actual data; avoid over-indexing. **Connection management:** test Neon pooling/Prisma runtime connections and migrations in Vercel; use environment-appropriate URLs/config. **Backup:** verify provider backup/PITR capabilities, retention and restore tests; do not assume a backup exists because a managed database is used.

## 20. Non-functional requirements and service objectives

| Area | Required behavior | Quantitative target |
|---|---|---|
| Correctness | No silent lost edits; atomic publish; strict tenant isolation | Hard release gate |
| Availability | Public pages and editor fail predictably; operational monitoring | SLO Open |
| Recovery | Tested DB restore, object recovery assumptions, documented rollback | RTO/RPO Open |
| Performance | Mobile-friendly public SSR, fast local preview, bounded API latency | Budgets Open after benchmarks |
| Accessibility | Keyboard, semantics, focus, contrast, reduced motion | Target WCAG 2.2 AA |
| Browser support | Current mainstream Chromium/Firefox/Safari, mobile browsers | Exact matrix Open |
| Security | Authz, validation, CSP, rate limiting, secure upload, audit | No unresolved critical/high findings |
| Scalability | More portfolios/entries without structural rewrite; bounded resource use | Load model Open |
| Maintainability | Strict TS, modular boundaries, documented ADRs, CI | Enforced by checks |
| Observability | Traceable requests, meaningful alerts, privacy-safe logs | Coverage thresholds Open |
| SEO | SSR, canonical, OG, sitemap, robots, valid HTTP statuses | Automated SEO smoke tests |

Define explicit p75 Core Web Vitals, p95/p99 endpoint latency, editor input response, snapshot maximum bytes, max project count, upload size, DB connection budget, SLO, RTO and RPO **before production sign-off**. Proposed values should be benchmarked with representative templates, low-end devices, and real Vercel/Neon/R2 integration rather than invented as guarantees.

## 21. Testing and verification strategy

**Unit (Vitest):** validators, slug normalization, design-token resolver, entitlement rules, permission predicates, error mapping, snapshot normalization, template compatibility and autosave coordinator state transitions. **Component (RTL):** accessible forms, validation messages, save states, navigation, conflict UI, admin action confirmation. **Integration (real PostgreSQL):** FK/unique/check constraints, idempotent retry, revision races, publish consistency, rollback, quota races, cross-tenant queries, soft deletion, moderation. Do not rely exclusively on SQLite or mocked Prisma for PostgreSQL transaction semantics.

**E2E (Playwright):** sign up/sign in, onboarding resume, edit/preview, template switch without content loss, autosave under throttled network, two-tab conflict, publish/unpublish, public slug routing, SEO metadata, media upload rejection, admin moderation and immediate public unavailability, account disable, recovery from transient API errors. Mock external providers selectively; maintain staging smoke tests against actual Clerk/Neon/R2 where permitted. **Accessibility:** axe-core plus keyboard/screen-reader spot checks. **Security:** automated negative access tests, dependency scanning, secret scanning, manual review for high-risk endpoints. **Performance:** public Lighthouse/Web Vitals plus targeted load and DB query profiling.

### 21.1 Required adversarial test matrix

| Scenario | Expected result |
|---|---|
| Two tabs save revision N concurrently | Exactly one advances; other gets 409 |
| Same mutation retried after response loss | Same committed outcome; no duplicate effect |
| Publish races with autosave | Consistent snapshot of checked revision or conflict |
| Two publish requests concurrently | No duplicate/incorrect version numbering |
| User guesses another portfolio ID | No private data or mutation |
| User references another user's media | Rejected |
| Owner attempts to publish suspended portfolio | Rejected |
| Admin suspends a cached public site | Public exposure bounded by tested revocation policy |
| R2 upload incomplete/malformed | Never becomes READY |
| Slug allocated concurrently | Unique allocation; no takeover |
| User switches templates | Content preserved |
| Historical snapshot rendered after template upgrade | Compatible or safe explicit fallback |
| Rollback points to foreign version | Rejected at service and DB boundary |
| Failed publish after version insert attempt | Transaction rolls back; old version remains active |

## 22. CI/CD, environments and migrations

**Repository:** Git-based workflow with protected main branch and required reviews. **Package manager:** pnpm; pinned lockfile and supported Node version recorded in `.nvmrc`/engines. **Quality:** strict TypeScript, ESLint, Prettier, unit/component/integration tests, build, dependency/secret scanning. **Pipeline:** install → lint/typecheck → tests → production build → preview/staging smoke/E2E → review/approval → production deployment → smoke and monitoring. E2E external-provider tests must use isolated accounts/data and safe cleanup.

**Environments:** local, staging, production with separate Clerk projects, DBs, R2 buckets, webhook endpoints, GA4 properties/streams as needed, and secrets. Preview deployments must not point to production writable resources. Configure and validate env vars at boot/build with Zod or equivalent; do not expose server-only secrets through `NEXT_PUBLIC_`.

**Database migrations:** Prisma Migrate with reviewed SQL; custom migrations for CHECK, partial/composite constraints, and any DB-level enforcement Prisma cannot express. Use expand-and-contract rollout: add compatible structures → deploy compatible code → backfill → switch reads/writes → remove obsolete structures in later release. Migration execution is a controlled CI/release step, not a race between serverless instances. Backup/restore point and rollback strategy required for destructive changes. Code rollback cannot undo schema changes automatically.

**Deploy rollback:** rollback to prior compatible Vercel deployment, verify DB schema compatibility and snapshot renderer support, monitor error rate, and use feature flags/kill switches for high-risk changes. Public hostname/TLS and edge caching changes require staged verification. Incident ownership and on-call expectations remain **Open**.

## 23. Observability, operational runbooks and incident response

Use structured server logs with request ID, route, status, latency, actor ID where privacy-appropriate, portfolio ID, revision, mutation ID, and error code; never log auth cookies, credentials, raw biographies, private media or unnecessary PII. Sentry captures exceptions and performance samples with sensitive-data scrubbing. Track key signals: API 5xx/429, autosave 409 rate, publish failures, outbox backlog, failed uploads, DB connection saturation, public 404 rate, cache invalidation failures, webhook processing failures, unusual admin actions and storage usage. Configure actionable alerts, not noisy dashboards alone.

Required runbooks: failed deployment, database unavailable, migration failure, Clerk outage, R2 outage, public portfolio stale/suspended cache, webhook backlog, autosave conflicts spike, queue/outbox failure, credential compromise, accidental admin moderation, and restore from backup. Each runbook needs detection, impact, mitigation, rollback/recovery, communication, and post-incident follow-up. Periodic restore drills must verify RTO/RPO targets after they are set.

## 24. Infrastructure proof-of-concept checklist — blocking

| Spike | Test | Acceptance evidence |
|---|---|---|
| Wildcard routing | Deploy marketing/app/portfolio hosts to Vercel | Correct host routing, 404 behavior, no route collision |
| Wildcard TLS/DNS | Test real subdomain certificate provisioning | HTTPS valid across generated slugs |
| Clerk | Sign in/out, server auth, callback/redirects, subdomain behavior | Session works only where intended; no leakage |
| Neon/Prisma | Pooled runtime connections and migrations | No connection exhaustion in representative concurrency |
| R2 | Signed upload, completion verification, public delivery | Ownership, expiry, type/size checks pass |
| Public caching | Publish/unpublish/suspend with warm CDN/cache | Tested bounded stale-content exposure |
| Transactions | Concurrent save/publish/rollback | Invariants hold on actual PostgreSQL |
| SEO | SSR metadata, canonical, sitemap, public statuses | Automated and manual validation |
| Monitoring | Inject controlled error and failed job | Alert and correlation trace available |
| Recovery | Restore isolated DB backup and inspect R2 references | Documented recovery steps succeed |

**No PoC has yet been run.** A failure of any blocking spike must produce an ADR amendment before feature implementation depends on it.

## 25. Security and release gates

**Block production release if:** cross-tenant access succeeds; stale draft writes overwrite newer revisions; publish creates partial/inconsistent public data; a suspended portfolio remains accessible beyond approved revocation objective; admin authorization is bypassable; media upload accepts unverified executable/unsafe content; secrets appear in client/logs; backup restoration is untested; critical/high security findings remain open without formally accepted mitigation; wildcard routing/TLS is unverified; CI required checks fail; schema migration rollback compatibility is unknown; or unsupported published snapshots break during deployment.

**Launch checklist:** PRD MVP acceptance tests pass; three templates accessible/responsive; all critical user journeys pass E2E; SEO and public statuses validated; analytics consent policy resolved; legal/privacy policies reviewed; domain/brand clearance verified; quotas configured; support/moderation ownership assigned; alert routing tested; backups/restores demonstrated; load budgets and SLO/RTO/RPO approved; production smoke test and rollback procedure executed in staging.

## 26. Detailed implementation contracts to be authored next

1. **`BACKEND_SCHEMA.md`:** complete ERD, Prisma schema, SQL constraints, indexes, referential actions, quota/idempotency/outbox models, migration plan, data retention.
2. **`API_CONTRACTS.md`** (recommended additional artifact): endpoint methods/paths, Zod DTOs, errors, auth policy, rate limits, pagination, idempotency, cache headers, examples.
3. **`APP_FLOW.md`:** exact host/route map, screens, onboarding/editor/publish/admin flows, state transitions, redirect and error behavior.
4. **`UI_UX_DESIGN_BRIEF.md`:** design tokens, responsive patterns, three template specs, editor interaction states, accessibility, content limits and empty/error states.
5. **`IMPLEMENTATION_PLAN.md`:** milestones, dependency graph, acceptance tests, spikes, ownership, estimation, release sequencing.
6. **`SECURITY_THREAT_MODEL.md`** (recommended): trust boundaries, assets, attack scenarios, mitigations and verification.
7. **`RUNBOOKS.md`** (recommended): monitoring, backups, incident response and rollback.

## 27. Open decisions and owners

| Topic | Status | Required decision / evidence | Suggested owner |
|---|---|---|---|
| Domain/trademark | Open | Legal/domain clearance | Product/business |
| Exact Prisma schema | Next work | Constraints and migrations reviewed | Engineering |
| API DTO catalog | Next work | Full request/response contracts | Engineering |
| Rich text | Open | Plain text vs restricted editor | Product/design/engineering |
| Free quotas | Open | Entry, media, snapshot, payload caps | Product/engineering |
| Minimum publish fields | Open | Exact validation rules | Product/design |
| Template token matrix | Open | Supported overrides by template | Design/engineering |
| Identity vs. username | Resolved (M3) | publicSlug immutable; username freely editable with 307 canonical redirects | — |
| Account deletion retention | Open | Legal and recovery periods | Product/legal/security |
| Consent and analytics retention | Open | Jurisdiction/privacy rules | Product/legal |
| Background worker | Open | Provider + operational design | Engineering/DevOps |
| Media processing/CDN | Open | R2 delivery and optimization PoC | Engineering/DevOps |
| Wildcard DNS/TLS | Unverified | Deployed proof of concept | Engineering/DevOps |
| Cache revocation | Open | Suspension visibility objective + test | Engineering/security |
| SLO, RTO, RPO | Open | Numeric targets and drills | Product/operations |
| Browser matrix | Open | Supported versions/devices | Product/QA |
| Rollback UI release | Open | MVP timing while capability required | Product |
| Abuse report anonymity | Open | Reporter and privacy rules | Product/trust |
| Contact form | Proposed external links MVP | Confirm user experience | Product |

## 28. Engineering sign-off criteria and change management

This TRD is ready for **design review**, not implementation sign-off. Architecture is considered implementation-ready when: (a) PRD open items affecting schema/security are resolved; (b) `BACKEND_SCHEMA.md` and API contracts are reviewed; (c) editor/publishing concurrency invariants are specified as tests; (d) blocking infrastructure PoCs pass; (e) threat model and operational budgets are approved; (f) CI/staging/migration strategy is actionable. Every significant change after sign-off updates the relevant ADR, TRD section, API/schema artifact and regression tests.

### Review checklist

- [ ] Product owner confirms MVP behavior and open scope decisions.
- [ ] Backend reviewer approves ownership, transaction and idempotency design.
- [ ] Frontend reviewer approves state boundaries, autosave and preview contract.
- [ ] Security reviewer approves authz, tenant isolation, uploads and moderation.
- [ ] Infrastructure reviewer validates Vercel/Clerk/Neon/R2 PoCs.
- [ ] QA reviewer approves integration/E2E/adversarial coverage.
- [ ] Operations reviewer approves alerts, backups, restore and rollback.
- [ ] Implementation plan maps requirements to deliverables and acceptance tests.

---

**Document status:** Detailed technical baseline based on Foliovanta PRD and agreed architecture. All examples and proposed endpoint shapes are specifications, not evidence of working code. The next priority is `BACKEND_SCHEMA.md` and its executable Prisma/SQL design, followed by complete API contracts and infrastructure validation.
