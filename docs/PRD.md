# Foliovanta — Product Requirements Document (PRD)

> **Product:** Foliovanta  
> **Tagline:** Your story. Your work. Your identity.  
> **Document:** PRD.md  
> **Version:** 1.0 — comprehensive planning baseline  
> **Date:** 21 October 2026  
> **Status:** Draft for product review; not a claim of implementation or production readiness  
> **Related documents (planned):** `TRD.md`, `APP_FLOW.md`, `UI_UX_DESIGN_BRIEF.md`, `BACKEND_SCHEMA.md`, `IMPLEMENTATION_PLAN.md`

---

## 1. Executive summary

Foliovanta is a multi-tenant, self-service SaaS platform that helps individuals create, customize, publish, and maintain a professional portfolio website without coding or managing hosting. The product serves students, developers, designers, freelancers, and other professionals. Users enter structured career and project information, select a curated template, personalize its appearance within supported controls, preview the result, and publish it to a hosted Foliovanta subdomain.

The initial release emphasizes **speed to first publish, high-quality responsive presentation, predictable editing, secure account and content isolation, reliable publishing, and discoverability**. It is a structured portfolio builder, **not** a drag-and-drop website/page builder. Its public sites are rendered from explicitly published, immutable content snapshots; unfinished editor changes must never leak onto the public site.

The platform includes an internal Super Admin area for operational user management, portfolio moderation, abuse reports, feedback, and auditability. Foliovanta launches with a free offering and configurable usage limits. Paid plans, custom domains, multiple portfolios per user, and advanced analytics are future possibilities, not launch commitments.

### 1.1 Document authority and interpretation

This PRD is the source of truth for **product behavior, scope, acceptance criteria, and user outcomes**. The TRD will govern technical architecture and integration choices; the backend schema will govern persistence and database constraints. Where the PRD names an architectural decision already agreed, it is included to preserve a product-critical constraint—not to replace the technical specification.

**Decision labels:**
- **Agreed:** Established product or architecture direction from planning discussions.
- **Proposed:** Recommended default awaiting explicit product sign-off.
- **Open:** Requires a product/business decision or validation.
- **Future:** Outside MVP unless subsequently reprioritized.

No code, deployment, domain ownership, DNS configuration, provider integration, or infrastructure proof of concept has been completed or verified as part of this document.

## 2. Product vision and positioning

### 2.1 Vision

Enable anyone with meaningful work or experience to establish a credible, attractive, maintainable online professional identity in minutes rather than days.

### 2.2 Value proposition

1. **Guided creation:** Replace blank-page uncertainty with structured onboarding and sensible defaults.
2. **Professional output:** Deliver responsive, accessible, polished templates that present content clearly.
3. **Easy maintenance:** Update structured content without rebuilding a website.
4. **Control without complexity:** Customize colors, fonts, layout variants, and sections within safe, curated options.
5. **Publish with confidence:** Review changes before publishing; keep public content stable until explicitly updated.
6. **Hosted identity:** Receive a shareable, SEO-capable Foliovanta subdomain without deploying code.

### 2.3 Differentiation hypothesis (proposed)

Foliovanta combines a guided professional profile workflow, curated template quality, predictable design customization, and versioned publishing. This is a positioning hypothesis to validate with users, not an established market claim.

### 2.4 Brand

- **Name:** Foliovanta.
- **Tagline:** “Your story. Your work. Your identity.”
- **Primary web presence (planned):** `foliovanta.com`.
- **Application (planned):** `app.foliovanta.com`.
- **Public portfolio URLs (planned):** `<unique-slug>.foliovanta.com`.
- **Brand/domain clearance:** **Open**; trademark availability, domain ownership, and legal use have not been verified.

## 3. Goals, non-goals, and principles

### 3.1 MVP goals

| ID | Goal | Evidence of success |
|---|---|---|
| G-01 | Allow a new user to create an account and begin a portfolio | Successful signup → onboarding transition |
| G-02 | Make initial portfolio creation approachable | Optional onboarding steps can be skipped without blocking progress |
| G-03 | Let users manage structured professional content | All MVP content sections support the required CRUD actions |
| G-04 | Offer high-quality design without coding | Three usable, responsive, switchable templates |
| G-05 | Enable controlled personalization | Supported appearance changes preview correctly and persist |
| G-06 | Publish a stable, shareable website | Public URL serves only an explicitly published snapshot |
| G-07 | Make portfolio content discoverable | SSR, metadata, canonical URLs, structured data, sitemap, and indexing controls |
| G-08 | Protect users and the platform | Verified auth, resource authorization, moderation, abuse controls |
| G-09 | Give operators essential oversight | Super Admin can inspect and moderate users/portfolios with audit logs |
| G-10 | Ship a maintainable production service | Critical flows covered by testing, monitoring, deployment and recovery plans |

### 3.2 Non-goals for MVP

- Arbitrary freeform page editing, unrestricted HTML/CSS/JavaScript, or user-installed plugins.
- Custom domain connection and domain purchase/management.
- More than one active portfolio per user in the user-facing MVP.
- Payments, subscription checkout, billing portal, invoicing, and revenue analytics.
- AI-generated resumes, AI-written portfolio content, or automatic scraping/import of external profiles.
- Collaboration, team workspaces, shared editing, real-time coauthoring.
- Full CMS/blog publishing, ecommerce, appointment booking, or custom backend forms.
- Native iOS/Android applications and public third-party developer API.
- Full-featured individual portfolio analytics dashboard.
- Realtime inbox, browser push notifications, or social networking features.
- Guaranteed search-engine ranking or immediate indexing.

### 3.3 Product principles

- **User-owned story, structured content:** Content is independent of its presentation template.
- **Explicit publication:** Saving a draft never publishes it automatically.
- **Safe defaults:** Users can publish a complete-looking portfolio with minimal configuration.
- **Progressive disclosure:** Advanced appearance controls do not overwhelm new users.
- **Accessible by design:** Keyboard access, readable typography, semantic markup, and responsive layouts are core requirements.
- **Recoverability:** Failures must not silently destroy work or previously published content.
- **Controlled extensibility:** Add more entries without schema changes; introduce new content types deliberately.
- **Operational accountability:** Administrative actions and consequential lifecycle transitions are traceable.

## 4. Target audiences and personas

| Persona | Primary need | Typical portfolio content | Product implication |
|---|---|---|---|
| Student / recent graduate | Establish credibility without extensive experience | Education, projects, skills, certifications, links | Skippable experience; project-first templates |
| Software developer | Showcase technical work and contributions | Projects, repositories, technologies, experience | Repository/demo links, clear project cards |
| Designer / creative professional | Present visual work attractively | Project imagery, case studies, bio, contact | Image-forward Creative template; reliable media handling |
| Freelancer / consultant | Convert visitors into professional inquiries | Services conveyed through bio/projects, experience, contact | Prominent contact actions; professional presentation |
| Experienced professional | Present career history and accomplishments | Experience, education, achievements, certifications | Readable timeline and Professional template |
| Super Admin / operator | Keep the service safe and functioning | Users, portfolios, reports, audit events | Role-restricted operational interface |

Personas influence onboarding defaults and template suggestions; they must not permanently restrict a user's available content sections or templates.

## 5. Scope and release classification

### 5.1 MVP — required

- Public marketing landing page and template discovery.
- Clerk-based signup/signin, Google and email/password options, account lifecycle integration.
- Guided, skippable onboarding with persona, profile, background, projects, template selection.
- One portfolio per user; stable unique hosted subdomain.
- Structured editor for Profile, About, Experience, Education, Projects, Skills, Certifications, and Contact/Social.
- Section visibility, ordering, and supported section layout variants.
- Three launch templates: Minimal, Professional, Creative.
- Curated and validated design controls; instant local preview.
- Draft autosave with clear save status, conflict detection, and error recovery.
- Explicit publish, republish, unpublish, preview, and published version history; rollback supported in the core design.
- Responsive public portfolio rendering with SEO metadata and indexing controls.
- Media uploads for profile and project images, subject to validation and quotas.
- Dashboard, portfolio settings, account settings, and feedback.
- Super Admin for user/portfolio oversight, moderation, abuse reports, feedback, and audit logs.
- GA4, authoritative business events, error monitoring, accessibility checks, and production release controls.

### 5.2 MVP implementation choices requiring detailed sign-off

- Exact onboarding step count, field-level requiredness, and persona-specific ordering.
- Exact theme palette, font, radius, spacing, and layout options per template.
- Whether rich text is required at launch, and which formatting features are permitted.
- Exact free-tier quotas, upload size limits, and published-version retention limits.
- Whether a user-facing rollback screen ships in the first milestone or immediately following initial publish capability. **Product baseline: rollback capability is required; scheduling is open.**
- Exact account deletion grace period, data retention periods, and support response policies.
- Contact method (recommended MVP: safe mailto/external links; hosted contact form is not yet committed).

### 5.3 Future roadmap candidates

Multiple portfolios, paid subscriptions, custom domains, additional templates, advanced per-portfolio analytics, portfolio import/export, multilingual content, richer case-study layouts, AI assistance, collaboration, and external APIs. Future features require their own requirements and prioritization before development.

## 6. Information architecture and user-facing surfaces

The product comprises four major surfaces:

1. **Marketing and template discovery** — public landing, template gallery, template detail/demo.
2. **Authenticated creator application** — onboarding, dashboard, editor, preview, publishing, settings, feedback.
3. **Published portfolio sites** — unique public subdomains, with appropriate unavailable states.
4. **Super Admin** — restricted operational console within the application.

### 6.1 Planned page inventory

Routes below are **planning-level URL proposals**, not yet the definitive Next.js route implementation.

| Area | Planned pages / states |
|---|---|
| Marketing | `/`, `/templates`, `/templates/[templateId]` |
| Authentication | `/sign-up`, `/sign-in`, provider callback/error states |
| Onboarding | `/onboarding/welcome`, `/onboarding/profile`, `/onboarding/background`, `/onboarding/projects`, `/onboarding/template` |
| Dashboard | `/dashboard`, empty state, draft state, published state |
| Editor | `/editor/profile`, `/editor/about`, `/editor/experience`, `/editor/education`, `/editor/projects`, `/editor/skills`, `/editor/certifications`, `/editor/contact`, `/editor/design`, `/editor/layout` |
| Preview / publish | `/preview`, `/publish`, `/publish/success`, confirmation/error states |
| Settings | `/settings/portfolio`, `/settings/portfolio/versions`, `/settings/account`, `/feedback` |
| Public | `<slug>.foliovanta.com`, 404, unpublished, suspended/unavailable states |
| Super Admin | `/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/portfolios`, `/admin/portfolios/[id]`, `/admin/feedback`, `/admin/reports`, `/admin/audit-logs` |
| Future Admin | `/admin/analytics`, `/admin/settings` |

An editor section may be a nested route or a state within a shared editor shell; this PRD specifies navigation behavior, not file-system route structure.

## 7. End-to-end user journeys

### 7.1 First-time creator journey

1. Visitor opens marketing site and reviews templates/value proposition.
2. Visitor selects a primary CTA (e.g., “Create your portfolio”).
3. Visitor signs up using a supported Clerk authentication method.
4. Application provisions or reconciles the internal user record.
5. User selects persona or skips where permitted.
6. User adds profile, optional background, optional projects, and chooses a template.
7. Platform creates/updates a draft portfolio with a unique public slug.
8. User enters editor and sees live preview and save status.
9. User reviews publication readiness, resolves blocking issues, and publishes.
10. User receives a public link and can open/share it.

**Acceptance:** A new user can reach first publish without being forced to complete optional content sections.

### 7.2 Returning creator journey

1. User signs in and opens dashboard.
2. Dashboard displays portfolio state and appropriate actions.
3. User opens editor, modifies content or design, and sees immediate preview.
4. Autosave persists draft changes; public site remains unchanged.
5. User publishes the latest confirmed draft revision.
6. Public site switches atomically to the new published version.

### 7.3 Portfolio visitor journey

1. Visitor opens a valid portfolio subdomain without signing in.
2. Server resolves the slug and publication eligibility.
3. Page displays the active published snapshot with responsive styling and SEO metadata.
4. Visitor browses sections and follows project/social/contact links.
5. Public analytics may record privacy-compliant views/interactions.

### 7.4 Moderation journey

1. Super Admin authenticates and is authorized by application RBAC.
2. Admin reviews a reported or flagged portfolio.
3. Admin records moderation reason and takes a permitted action.
4. Suspended content becomes unavailable publicly even if a published version exists.
5. Action is audited; reinstatement requires an authorized follow-up action.

## 8. Functional requirements — authentication and account

| ID | Requirement | Priority |
|---|---|---|
| AUTH-01 | Support signup and signin with Clerk-managed Google and email/password authentication | P0 |
| AUTH-02 | Maintain authenticated web sessions using Clerk-managed session credentials; do not build custom localStorage token storage | P0 |
| AUTH-03 | Verify session server-side for all private operations | P0 |
| AUTH-04 | Link Clerk identity to a unique internal user record | P0 |
| AUTH-05 | Enforce server-side role and resource authorization independently of authentication | P0 |
| AUTH-06 | Require verified email before publishing, where supported by the chosen auth flow | P0 |
| AUTH-07 | Support signout and appropriate session-expired/unauthorized states | P0 |
| AUTH-08 | Allow user to review/update supported account information | P0 |
| AUTH-09 | Support account deletion request and immediate access/public-visibility restrictions, subject to retention policy | P0 |
| AUTH-10 | Protect privileged admin routes and APIs with database-backed RBAC | P0 |
| AUTH-11 | Reconcile internal identity records when webhooks are delayed, duplicated, or out of order | P0 |

**Rules:** Authentication establishes identity; it does not grant ownership of a portfolio. Account suspension and deletion must override otherwise-valid sessions at the application authorization layer. Do not assume Clerk session cookie internals; follow supported SDK behavior and verify integration during implementation.

## 9. Functional requirements — onboarding

### 9.1 Steps and behavior

| ID | Requirement | Priority |
|---|---|---|
| ONB-01 | Present a guided onboarding experience with progress indication | P0 |
| ONB-02 | Allow persona selection: student, developer, designer, freelancer, professional, or suitable other option | P0 |
| ONB-03 | Collect essential identity/profile details and optional bio/headline | P0 |
| ONB-04 | Offer education/experience/skills entry based on persona without hiding other sections permanently | P0 |
| ONB-05 | Allow initial project entry or skipping projects | P0 |
| ONB-06 | Show launch template choices with previews | P0 |
| ONB-07 | Preserve completed steps when navigating backward/forward or returning later | P0 |
| ONB-08 | Permit skipping nonessential steps and publishing a minimally valid portfolio | P0 |
| ONB-09 | Route completed onboarding to editor/dashboard appropriately | P0 |
| ONB-10 | Handle interrupted onboarding without duplicate portfolio creation | P0 |

### 9.2 Minimum publish-ready profile

**Proposed:** Require a nonempty public display name, a valid selected template, an allocated slug, and a valid design configuration. Headline, biography, projects, experience, and education remain optional. A final minimum-field policy requires UX/product sign-off.

## 10. Functional requirements — portfolio dashboard

| ID | Requirement | Priority |
|---|---|---|
| DASH-01 | Show portfolio existence and lifecycle state (draft, published, unpublished, suspended where applicable) | P0 |
| DASH-02 | Provide primary actions: edit, preview, publish/update, view public site, settings | P0 |
| DASH-03 | Show public URL only when allocated, and distinguish link availability from public accessibility | P0 |
| DASH-04 | Show last saved/published timestamps when available | P0 |
| DASH-05 | Show clear empty, loading, error, and recovery states | P0 |
| DASH-06 | Prevent users from accessing another user's dashboard/portfolio by URL manipulation | P0 |
| DASH-07 | Display upgrade or usage prompts only when corresponding entitlements exist | Future |

## 11. Functional requirements — structured editor

### 11.1 Shared editor shell

- Persistent navigation between editable sections.
- Clear indication of current section, save state, preview mode, and publish availability.
- Responsive editing experience on supported mobile, tablet, and desktop viewports.
- Inline field validation and actionable error messages.
- Ability to add, edit, reorder, hide/show, and remove supported repeatable content.
- Deleting content requires appropriate confirmation when destructive; hiding a section must preserve its content.
- Unsaved edits must not be silently lost during section navigation.

### 11.2 Section requirements

| ID | Section | Minimum supported content / operations |
|---|---|---|
| EDT-01 | Profile | Display name, professional headline, location (optional), profile image, relevant introduction fields |
| EDT-02 | About | Biography/summary, safe supported formatting, show/hide |
| EDT-03 | Experience | Repeatable organization, role, location, dates, current role, description; reorder/remove |
| EDT-04 | Education | Repeatable institution, degree, field, dates, description; reorder/remove |
| EDT-05 | Projects | Repeatable title, summary/description, demo/repository links, images, featured flag; reorder/remove |
| EDT-06 | Skills | Repeatable skill names and optional grouping/category; reorder/remove |
| EDT-07 | Certifications | Repeatable title, issuer, issue/expiry dates, credential URL; reorder/remove |
| EDT-08 | Contact/Social | Email/contact destination and repeatable social platform, label, URL; reorder/remove |
| EDT-09 | Sections | Visibility, ordering, and supported layout variant for each section |
| EDT-10 | Design | Template, palette/custom colors, fonts, spacing, radius, and supported variants |

**Proposed clarification:** Profile and About are separate editing sections but may be rendered together in some templates. Public rendering must preserve content semantics regardless of layout.

### 11.3 Content quantity and extensibility

Users may add more entries to existing repeatable content types **without database schema changes**. Limits are product entitlements and operational quotas, not fixed numbered columns or hardcoded array slots.

- Quotas must be configurable and enforced on the server, including under concurrent requests.
- The UI must communicate usage and actionable limit errors.
- Quotas can differ by future plan, but MVP is free.
- Limits for number of entries, media storage, individual uploads, published versions, and payload sizes are **Open**.
- Adding a new *kind* of structured content may require a new schema and UI capability; unlimited entry count does not imply arbitrary custom content types.

### 11.4 Rich text and links

**Open:** Whether launch content uses plain text, a constrained rich-text editor, or both. Regardless of implementation:
- Disallow executable HTML/JavaScript and unsafe embeds.
- Validate links and supported protocols.
- Render safe semantic markup.
- Ensure editor content remains compatible across templates.

## 12. Functional requirements — draft autosave and consistency

| ID | Requirement | Priority |
|---|---|---|
| SAVE-01 | Update local editor and preview immediately as the user types | P0 |
| SAVE-02 | Autosave changed content after a short debounce (initial target ~800 ms; tune through testing) | P0 |
| SAVE-03 | Show meaningful states: unsaved, saving, saved, error, offline, conflict | P0 |
| SAVE-04 | Preserve changes typed while a save is in flight | P0 |
| SAVE-05 | Serialize/coalesce same-draft writes or provide an equivalently safe ordering strategy | P0 |
| SAVE-06 | Use an authoritative draft revision and reject stale conflicting writes | P0 |
| SAVE-07 | Support idempotent retry when a successful response is lost | P0 |
| SAVE-08 | Preserve pending changes on recoverable errors and normal editor navigation | P0 |
| SAVE-09 | Warn before leaving when unsaved work could be lost | P0 |
| SAVE-10 | Prevent publish until pending changes are acknowledged and conflicts resolved | P0 |
| SAVE-11 | Handle multiple open tabs without silently overwriting one tab's changes | P0 |
| SAVE-12 | Evaluate persistent local crash recovery and document supported guarantees | P1 / Open |

**Acceptance scenarios:** (a) Edit during in-flight save: newest input remains intact; (b) two tabs edit same revision: stale save conflicts; (c) retry after lost response: mutation is not duplicated; (d) offline during editing: unsaved state is visible; (e) publish while saving: publishing waits or blocks safely.

## 13. Functional requirements — templates and design system

### 13.1 Launch templates

| Template | Intent | Required characteristics |
|---|---|---|
| Minimal | Clean, content-first presentation | Strong typography, restrained visuals, clear hierarchy |
| Professional | Career and credibility focused | Structured experience/education presentation, polished contact actions |
| Creative | Visual work and personality | Image-forward project presentation, expressive but accessible composition |

Each template must support all canonical MVP content sections, although presentation and section layouts may vary.

### 13.2 Template requirements

| ID | Requirement | Priority |
|---|---|---|
| TMP-01 | Show previews of available templates before selection | P0 |
| TMP-02 | Allow switching templates without losing content | P0 |
| TMP-03 | Keep content model independent of template components | P0 |
| TMP-04 | Validate template configuration and design overrides | P0 |
| TMP-05 | Support responsive desktop/tablet/mobile rendering | P0 |
| TMP-06 | Maintain accessible contrast, focus behavior, and semantic structure | P0 |
| TMP-07 | Version template implementations so published snapshots can remain renderable | P0 |
| TMP-08 | Provide safe fallback when a saved configuration references a retired/unsupported option | P0 |

### 13.3 Appearance customization

- Curated palettes plus validated custom color choices.
- Curated heading and body fonts; deterministic font loading/fallbacks.
- Light/dark variants only where a template supports them.
- Supported spacing density, border radius, button/card treatments, and section layout presets.
- Preview updates before publication.
- Validation prevents unusable color combinations or invalid configuration values.
- Arbitrary CSS, user scripts, and untrusted font URLs are prohibited.

**Open:** Exact control matrix per template, palette catalog, font catalog, and custom-color accessibility policy.

## 14. Functional requirements — preview, publish, versions and rollback

### 14.1 Preview

- Preview the current draft, including local unsaved changes, through the shared renderer.
- Support meaningful viewport modes (mobile/desktop; tablet if needed).
- Clearly identify preview as unpublished draft content.
- Prevent search-engine indexing of private preview routes.
- Do not expose drafts through guessable public URLs.

### 14.2 Publication lifecycle

| ID | Requirement | Priority |
|---|---|---|
| PUB-01 | Require an explicit user action to publish | P0 |
| PUB-02 | Verify ownership, account eligibility, required content, and valid template configuration | P0 |
| PUB-03 | Confirm all pending draft saves before publication | P0 |
| PUB-04 | Publish a consistent, complete snapshot from an expected draft revision | P0 |
| PUB-05 | Store each publication as an immutable version with schema/template version metadata | P0 |
| PUB-06 | Atomically activate the new version; on failure retain the prior public version | P0 |
| PUB-07 | Republish edited drafts without changing the stable public slug | P0 |
| PUB-08 | Unpublish without deleting drafts or publication history | P0 |
| PUB-09 | Allow an authorized user to inspect version history and restore a prior published version | P0 design; release sequencing open |
| PUB-10 | Prevent suspended portfolios from becoming public through publish/rollback | P0 |
| PUB-11 | Invalidate public caches safely after publication state changes | P0 |
| PUB-12 | Provide success, validation-error, conflict, and server-error states | P0 |

### 14.3 Public-state rules

- **Draft:** No public content, even if a slug has been reserved.
- **Published:** Active published snapshot is publicly accessible if moderation/account eligibility permits.
- **Unpublished:** Public content unavailable; historical versions retained according to policy.
- **Suspended:** Public content unavailable regardless of publication state; ordinary creator publish cannot override suspension.
- **Deleted/disabled owner:** Public visibility follows account lifecycle policy and must not remain accidentally accessible.

### 14.4 Version compatibility

Published snapshots must record content schema version, template identity/version, and resolved design configuration. Deployment changes must not silently break previously published portfolios. Migration/fallback policy is specified in the TRD.

## 15. Functional requirements — public portfolio delivery

| ID | Requirement | Priority |
|---|---|---|
| WEB-01 | Resolve a unique hosted subdomain to the correct portfolio | P0 |
| WEB-02 | Render only the active published snapshot | P0 |
| WEB-03 | Support anonymous access to published portfolios | P0 |
| WEB-04 | Render responsive content for supported viewport sizes | P0 |
| WEB-05 | Expose accessible navigation and contact/project actions | P0 |
| WEB-06 | Display correct unavailable/404 behavior for unknown, unpublished, deleted, or suspended sites | P0 |
| WEB-07 | Use HTTPS and safe hostname handling | P0 |
| WEB-08 | Preserve canonical public URLs and avoid duplicate indexed versions | P0 |
| WEB-09 | Prevent unpublished content from appearing in cache or search indexing | P0 |
| WEB-10 | Record privacy-compliant public engagement events | P1 |

### 15.1 Slug policy

**Agreed direction:** Allocate a canonical lowercase, unique slug, for example `rishab-thakur-a7k2`. Reserved hostnames must not be available for portfolio allocation. **Proposed MVP rule:** Keep slugs immutable after allocation; a future slug-change workflow would need redirects and SEO rules.

### 15.2 External links and contact

Portfolio visitors can open validated project demos, repositories, professional social links, and supported contact destinations. **Proposed MVP:** use `mailto:` and external links rather than operating a public contact-form delivery system. If a hosted contact form is added, it requires spam protection, privacy disclosure, rate limiting, and notification delivery requirements.

## 16. Functional requirements — media

| ID | Requirement | Priority |
|---|---|---|
| MED-01 | Upload supported profile and project images | P0 |
| MED-02 | Restrict uploads to authenticated, authorized owners | P0 |
| MED-03 | Validate actual file type, dimensions, size, and ownership server-side | P0 |
| MED-04 | Store objects separately from relational metadata | P0 |
| MED-05 | Show upload, processing, success, rejection, and failure states | P0 |
| MED-06 | Optimize display images without unacceptable distortion | P0 |
| MED-07 | Provide useful alt-text fields or sensible accessible treatment | P0 |
| MED-08 | Preserve media referenced by published versions when removed from drafts | P0 |
| MED-09 | Clean up unreferenced assets safely after a grace period | P0 operational |
| MED-10 | Enforce upload and storage quotas | P0 |

**Agreed technology direction:** Cloudflare R2 with authorized signed uploads. Exact processing pipeline, CDN delivery, allowed formats, image caps, and media retention are pending technical and product sign-off.

## 17. Functional requirements — SEO and sharing

| ID | Requirement | Priority |
|---|---|---|
| SEO-01 | Server-render indexable published portfolio content | P0 |
| SEO-02 | Generate title, description, canonical URL, and Open Graph metadata | P0 |
| SEO-03 | Provide appropriate social preview imagery or fallback | P0 |
| SEO-04 | Generate relevant JSON-LD structured data with validated user content | P0 |
| SEO-05 | Provide robots and sitemap behavior appropriate to public/hidden states | P0 |
| SEO-06 | Avoid indexing preview, draft, suspended, and unpublished content | P0 |
| SEO-07 | Return appropriate HTTP status codes for unavailable pages | P0 |
| SEO-08 | Establish Search Console verification and monitoring procedures | P1 operational |

SEO functionality enables discoverability; Foliovanta does not guarantee indexing dates or search ranking.

## 18. Functional requirements — Super Admin

### 18.1 Access and roles

The platform supports internal `USER`, `ADMIN`, and `SUPER_ADMIN` roles, with permissions defined in the security specification. The existence of an admin UI does not confer authorization; every administrative action is verified server-side.

### 18.2 Administration capabilities

| ID | Requirement | Priority |
|---|---|---|
| ADM-01 | Restricted admin overview with operational counts/status | P0 |
| ADM-02 | Search, filter, and inspect users | P0 |
| ADM-03 | Inspect portfolios and publication/moderation state | P0 |
| ADM-04 | Suspend/reinstate eligible portfolios with required reason | P0 |
| ADM-05 | Review abuse reports and update their workflow status | P0 |
| ADM-06 | Review and triage user feedback | P0 |
| ADM-07 | Record immutable or tamper-evident audit trail for privileged actions | P0 |
| ADM-08 | Prevent ordinary admins from performing Super Admin-only actions | P0 |
| ADM-09 | Provide pagination and safe search/filtering for growing datasets | P0 |
| ADM-10 | Provide advanced cohort/revenue dashboards | Future |
| ADM-11 | Provide global feature/plan configuration interface | Future or limited initial ops tooling |

### 18.3 Moderation policy

A moderation action must include actor, target, action, timestamp, and reason. Suspension must affect public visibility promptly and cannot be bypassed by cached content or republishing. Content removal and account-level enforcement must follow a documented escalation and appeal/review policy (**Open**).

## 19. Functional requirements — feedback, reports, and notifications

### 19.1 Feedback

- Authenticated creators can submit product feedback.
- Feedback captures category/type, message, optional contextual metadata, timestamp, and processing status.
- Admin can review and update feedback status.
- Apply input limits, rate limits, and safe rendering.

### 19.2 Abuse reports

- Provide a safe mechanism to report an abusive public portfolio; exact entry point and whether reporter authentication is required are **Open**.
- Reports include portfolio reference, category, description, timestamp, and triage status.
- Protect against report spam and disclosure of private reporter details.

### 19.3 Notifications

| Channel | MVP behavior | Status |
|---|---|---|
| Inline save/publish state | Persistent contextual status | Agreed |
| Temporary UI feedback | Toasts, e.g. Sonner | Proposed stack |
| Authentication emails | Clerk-managed | Agreed |
| Transactional product emails | Use provider such as Resend when a defined workflow requires it | Proposed |
| Operational alerts | Sentry/monitoring alerts | Agreed direction |
| Persistent notification inbox | Not required | Future |
| Realtime and push | Not required | Future |

No user-facing email should be sent without a clear trigger, template, deliverability, and unsubscribe/consent policy where applicable.

## 20. Analytics and product measurement

### 20.1 Measurement architecture

- **GA4:** Behavioral web analytics where privacy/consent requirements permit.
- **Authoritative database events:** Durable records for critical business transitions; not dependent on client-side analytics blockers.
- **Sentry:** Errors and application reliability signals.
- **Future:** Rich user-facing portfolio analytics and advanced Super Admin analytics.

### 20.2 Event catalog (initial)

| Event | Trigger | Notes |
|---|---|---|
| `sign_up` | User account creation | Deduplicate across auth/webhook paths |
| `login` | Successful sign-in | Avoid sensitive identity payloads |
| `onboarding_started` | First onboarding entry | |
| `onboarding_step_completed` | Step successfully completed | Step identifier only |
| `onboarding_completed` | Onboarding finished/skipped to completion | |
| `template_selected` | User selects template | Template ID/version |
| `portfolio_draft_saved` | Server acknowledges draft mutation | Sample/aggregate to control volume; not necessarily GA4 |
| `portfolio_published` | Publication committed | Server-authoritative, idempotent |
| `portfolio_unpublished` | Unpublish committed | Server-authoritative |
| `portfolio_rolled_back` | Prior version activated | Server-authoritative |
| `portfolio_viewed` | Public portfolio served/viewed | Define bot filtering and deduplication |
| `project_link_clicked` | Visitor follows project link | Privacy-safe |
| `contact_clicked` | Visitor initiates contact | Privacy-safe |
| `feedback_submitted` | Feedback accepted | Server-authoritative |
| `abuse_report_submitted` | Report accepted | Server-authoritative |
| `moderation_action` | Admin action committed | Audit record authoritative |

### 20.3 Product KPIs

**Proposed metrics; targets are intentionally not fabricated.**
- Visitor → signup conversion.
- Signup → onboarding completion.
- Signup → first publish conversion.
- Median time from signup to first publish.
- Percentage of creators returning to edit/republish.
- Publish failure and autosave conflict rates.
- Public portfolio availability and latency.
- Template adoption and switching.
- Report resolution time and user feedback themes.

**Open:** Baseline data, numerical targets, attribution policy, retention windows, and analytics consent requirements by operating jurisdiction.

## 21. Security, privacy, trust, and abuse prevention

### 21.1 Product security requirements

| ID | Requirement | Priority |
|---|---|---|
| SEC-01 | Authenticate all private operations using supported Clerk server SDKs | P0 |
| SEC-02 | Authorize all portfolio reads/mutations against resource ownership and roles | P0 |
| SEC-03 | Prevent cross-tenant data access through guessed IDs, URLs, caches, or uploads | P0 |
| SEC-04 | Validate untrusted data at every server boundary | P0 |
| SEC-05 | Apply CSRF protections appropriate to cookie-authenticated mutations | P0 |
| SEC-06 | Apply rate limiting to abuse-prone operations | P0 |
| SEC-07 | Use bot challenges selectively where abuse warrants them | P0/P1 based on risk |
| SEC-08 | Restrict and sanitize user-provided rich content and external links | P0 |
| SEC-09 | Protect secrets and restrict privileged operations to server environments | P0 |
| SEC-10 | Verify webhook signatures and safely handle replay/duplicates | P0 |
| SEC-11 | Record consequential security/admin events in audit logs | P0 |
| SEC-12 | Prevent sensitive data from entering analytics and logs | P0 |
| SEC-13 | Support account deletion and defined retention/erasure workflows | P0 |
| SEC-14 | Apply appropriate CSP, security headers, HTTPS, and cookie configuration | P0 |

### 21.2 Privacy requirements

- Publish only fields explicitly intended for public display.
- Treat email addresses, location, and contact information as user-controlled disclosure choices.
- Explain what becomes public before first publication.
- Keep draft content private to the authorized user and permitted platform operators.
- Provide privacy policy, terms, reporting channel, and appropriate analytics consent handling before launch.
- Define data export/deletion response, backup retention, and audit retention in compliance review.

### 21.3 Abuse cases to test

Cross-user portfolio access, slug enumeration, unsafe external links, script injection, oversized uploads, image/polyglot payloads, upload URL replay, quota race conditions, webhook replay, spam reports, admin privilege escalation, and cached suspended content.

## 22. Non-functional requirements (NFRs)

### 22.1 Reliability and correctness

- A successful autosave acknowledgement means the corresponding draft mutation was committed.
- Retrying the same mutation must not duplicate its effect.
- Publishing must be atomic from the public reader's perspective.
- Failed publishing must leave the previously published version available.
- Concurrent editors/tabs must not silently overwrite each other.
- Moderation restrictions must take precedence over publication status.
- Versioned snapshots must remain compatible with supported renderer versions.

### 22.2 Performance

- Public portfolios must render efficiently on mobile networks and lower-end devices.
- Avoid unnecessary client-side JavaScript on public portfolio pages.
- Use image optimization, responsive images, lazy loading where appropriate, and explicit cache policy.
- Editor interactions and preview should feel immediate independent of network autosave latency.
- Large repeatable lists must remain usable with pagination/virtualization or appropriate UX constraints when necessary.
- **Open:** Define quantitative budgets (e.g., Core Web Vitals percentiles, public TTFB, API p95, maximum snapshot size) after representative templates and infrastructure are tested.

### 22.3 Availability, recovery, and operations

- Production and staging environments must be isolated.
- Critical services must have monitoring and actionable alerting.
- Database backups and recovery procedures must be documented and tested.
- Deployments and migrations must have safe rollout/rollback procedures.
- **Open:** Numeric availability SLO, recovery time objective (RTO), recovery point objective (RPO), and incident response ownership.

### 22.4 Accessibility

- Target WCAG 2.2 AA for platform UI and supported templates, subject to an explicit accessibility test plan.
- Keyboard navigation and visible focus for all controls.
- Proper labels, errors, headings, landmarks, and accessible dialog behavior.
- Sufficient contrast for curated themes; validate custom colors and supply fallback/warnings.
- Meaningful alt text and reduced-motion support where relevant.

### 22.5 Compatibility and internationalization

- Support current mainstream Chromium, Firefox, and Safari versions on desktop and mobile, with an explicit browser support matrix before launch.
- Responsive across common mobile, tablet, and desktop viewports.
- English-first MVP is **proposed**; multilingual UI/content is future unless product scope changes.
- Use timezone-aware timestamps and locale-safe date formatting.

### 22.6 Maintainability and scalability

- One Next.js full-stack modular monolith for MVP, with strict server-only domain boundaries.
- Keep business services independent of React and HTTP transport.
- PostgreSQL is the source of truth; published content is read from immutable snapshots.
- Add content rows without schema changes; new content types evolve via deliberate schema/version changes.
- Avoid unnecessary infrastructure until justified by measured workloads.

## 23. Business rules and entitlements

| ID | Rule | Status |
|---|---|---|
| BR-01 | One portfolio per user in MVP UI/business policy | Agreed |
| BR-02 | Future multiple portfolios should not require fundamental schema redesign | Agreed |
| BR-03 | Hosted slug must be unique and exclude reserved names | Agreed |
| BR-04 | Portfolio is private until explicitly published | Agreed |
| BR-05 | Editing a draft does not change published content | Agreed |
| BR-06 | Section hide/show must not delete underlying content | Agreed |
| BR-07 | Switching templates must not lose content | Agreed |
| BR-08 | User cannot self-reinstate a suspended portfolio | Agreed |
| BR-09 | Free MVP with configurable usage quotas | Agreed |
| BR-10 | Quota values and over-limit handling | Open |
| BR-11 | Slug immutable after allocation | Proposed |
| BR-12 | Published-version history retention and maximum count | Open |
| BR-13 | Email verification required before first publish | Agreed direction |
| BR-14 | Deletion grace period and erasure timetable | Open |

## 24. Failure states and edge-case requirements

| Scenario | Required user/system behavior |
|---|---|
| Sign-in session expires during editing | Preserve local unsaved work where possible; prompt reauthentication; prevent unauthorized writes |
| Clerk webhook delayed | Reconcile internal user safely; no duplicate account |
| Two tabs save same draft revision | Reject stale write with conflict; preserve local changes for reconciliation |
| Network disconnects mid-autosave | Display unsaved/offline state; avoid false success |
| User publishes while save pending | Wait for confirmed revision or block with actionable status |
| Publish transaction fails | Preserve previous active public version |
| Two publish requests race | Prevent duplicate/inconsistent version activation |
| Template removed/updated | Render compatible snapshot or safe fallback per version policy |
| Uploaded image rejected | Explain reason and allow replacement; do not attach unsafe asset |
| Media removed from draft but referenced publicly | Preserve referenced object until safe to delete |
| User exceeds quota | Reject safely with clear explanation; do not corrupt existing data |
| Unknown slug | Correct 404/unavailable response; no private data disclosure |
| Portfolio suspended while cached | Public content becomes unavailable within defined invalidation bounds |
| User requests deletion | Restrict account/public visibility promptly; follow retention workflow |
| Admin attempts unauthorized action | Deny server-side, log appropriate security event |
| Public analytics blocked by browser | Core portfolio still functions; authoritative business events unaffected |

## 25. Acceptance criteria and release gates

### 25.1 Functional acceptance

- [ ] New user can sign up, complete/skip optional onboarding, choose template, and reach editor.
- [ ] Creator can create, update, reorder, hide/show, and delete all supported content entries.
- [ ] Three launch templates render the same content without data loss on switching.
- [ ] Design changes preview immediately and persist to draft.
- [ ] Autosave handles in-flight edits, retries, conflicts, and navigation without silent loss.
- [ ] Publishing requires a confirmed revision and creates an immutable version.
- [ ] Public portfolio serves only active published content; draft edits remain private.
- [ ] Unpublish, suspend, and rollback behaviors are correct and cache-safe.
- [ ] Public portfolio metadata, structured data, sitemap, canonical, and status behavior are correct.
- [ ] Super Admin can perform permitted moderation and inspect audit history.
- [ ] Media quotas, validation, ownership, and reference retention are enforced.
- [ ] Users cannot access or mutate another user's portfolio or media.

### 25.2 Technical/operational release gates

- [ ] Wildcard subdomain DNS/TLS and host routing validated on intended hosting.
- [ ] Clerk integration, session behavior, and internal identity reconciliation tested.
- [ ] Neon connection strategy and migration deployment validated.
- [ ] R2 signed upload, processing, and delivery tested end-to-end.
- [ ] Database constraints, concurrent autosave, and concurrent publish integration tests pass.
- [ ] E2E tests cover signup → onboarding → edit → publish → view → republish.
- [ ] Accessibility and cross-browser test matrix completed.
- [ ] Security review covers tenant isolation, CSRF, XSS, upload abuse, and admin RBAC.
- [ ] Sentry/logging/alerts enabled with privacy-safe data handling.
- [ ] Backup restore and deployment rollback exercises completed.
- [ ] Privacy/terms, domain rights, retention, and support policies approved.

**Important:** These are sign-off conditions, not completed tasks.

## 26. Dependencies, assumptions, and risks

| Risk/dependency | Impact | Mitigation / next action |
|---|---|---|
| Wildcard subdomains on Vercel | Public routing/TLS may require specific configuration | Run early infrastructure PoC |
| Clerk + subdomain session boundaries | Authenticated app and public hosts must behave safely | Validate cookie/session and host routing behavior |
| Snapshot/template compatibility | Deploy could break older portfolios | Versioned registry and compatibility tests |
| Autosave race conditions | Data loss and user distrust | Atomic revision/idempotency design; integration tests |
| Unbounded media/storage usage | Cost and abuse exposure | Configurable quotas, processing, cleanup |
| Public user-generated content | XSS, phishing, unsafe links | Validation, CSP, moderation, reporting |
| CDN/cache invalidation | Stale or suspended public content visible | Explicit invalidation and fail-safe eligibility checks |
| Third-party outages | Signup, upload, or delivery interruption | Error handling, retries, operational alerts |
| Domain/trademark unverified | Branding/legal launch blocker | Verify ownership and clearance |
| Privacy/compliance undecided | Launch and trust risk | Legal/privacy review and policy decisions |
| No validated KPI targets | Difficult launch evaluation | Set measurable targets after pilot baseline |

## 27. Decisions already agreed vs remaining open

### 27.1 Agreed architecture/product baseline

- Foliovanta brand and portfolio-builder direction.
- Next.js 16 App Router, React, TypeScript, Tailwind CSS, shadcn/ui/Radix.
- One full-stack modular monolith with clear frontend/backend responsibilities.
- Clerk-managed web sessions and database-backed roles/ownership.
- Neon PostgreSQL + Prisma.
- Native `fetch` + TanStack Query + Route Handlers for complex client mutations; direct server service calls for server-rendered reads.
- React Hook Form + Zod + selective Zustand, with revision-aware autosave.
- Cloudflare R2 for media.
- Structured relational drafts and immutable published JSON snapshots.
- Minimal, Professional, and Creative launch templates; content independent of presentation.
- Explicit publish/unpublish, versioning, and SEO-first public rendering.
- One portfolio per user MVP, extensible underlying model, configurable quotas.
- GA4 + database business events + Sentry.
- Vitest, React Testing Library, Playwright, GitHub Actions, Vercel deployment direction.

### 27.2 Open product decisions (must not be silently assumed finalized)

| Decision | Proposed default / required resolution |
|---|---|
| Public brand/domain rights | Verify before launch |
| Exact free-tier quotas | Product/operational sign-off |
| Minimum publish-ready fields | Display name + valid template/slug/config proposed |
| Rich-text formatting scope | Decide plain text vs restricted rich text |
| Contact mechanism | External links/mailto proposed |
| Template design control matrix | Define per-template options and defaults |
| Version retention and rollback UI timing | Define user experience and limits |
| Slug changes | Immutable MVP proposed |
| Account deletion and backup retention | Legal/product/operations policy |
| Public abuse-report entry and anonymity | Define moderation flow |
| Analytics consent and event retention | Privacy/legal policy |
| Performance budgets, SLO, RTO, RPO | Set after infrastructure PoC and load testing |
| Language and browser support | English-first/current major browsers proposed |
| Hosting wildcard feasibility | Verify through executable PoC |
| Background job provider | Select when actual workflows require it |

## 28. Milestones and implementation dependencies

This PRD establishes **scope and acceptance**, not committed delivery dates. The implementation plan will provide engineering estimates and dependency sequencing.

| Milestone | Product outcome | Exit condition |
|---|---|---|
| M0 — Architecture closure | Approved PRD, TRD, schema, flows, UI brief, implementation plan | Critical open decisions resolved or explicitly deferred |
| M1 — Platform foundation | Auth, database, environments, CI, hostname PoC | Verified identity, persistence, routing |
| M2 — Onboarding and dashboard | User can create a draft and resume editing | Journey and permission tests pass |
| M3 — Editor and design | Structured content, autosave, templates, preview | Conflict and rendering tests pass |
| M4 — Publishing and public sites | Versioned publication and hosted portfolios | Publish/rollback/SEO/caching tests pass |
| M5 — Operations and hardening | Admin, reports, media safety, monitoring, recovery | Security and release gates pass |
| M6 — Controlled launch | Production service with support/monitoring | Approved launch checklist and rollback plan |

## 29. Detailed user stories

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-01 | Visitor | Explore templates before signup | I can evaluate fit |
| US-02 | New user | Sign up with Google or email | I can start quickly |
| US-03 | Student | Skip work experience | I can publish without fabricated credentials |
| US-04 | Creator | Add unlimited-in-principle project entries within quota | My portfolio grows with my work |
| US-05 | Creator | Reorder and hide sections | I control presentation without losing content |
| US-06 | Creator | Switch templates safely | I can redesign without reentering data |
| US-07 | Creator | Customize supported colors and typography | My portfolio feels personal |
| US-08 | Creator | Preview edits instantly | I know how the site will look |
| US-09 | Creator | See when edits are saved or conflicted | I can trust the editor |
| US-10 | Creator | Publish only when ready | Draft work stays private |
| US-11 | Creator | Restore an earlier published version | I can recover from an unwanted update |
| US-12 | Creator | Share a stable portfolio URL | Others can find my work |
| US-13 | Visitor | View the portfolio on my phone | Content is readable anywhere |
| US-14 | Visitor | Follow project and contact links | I can engage with the creator |
| US-15 | Creator | Unpublish my portfolio | I control public availability |
| US-16 | Creator | Delete my account through a defined process | I control my personal data |
| US-17 | Operator | Review reported portfolios | I can enforce platform rules |
| US-18 | Super Admin | Suspend abusive content with an audit trail | Platform actions are accountable |
| US-19 | Operator | See error/health signals | I can respond to incidents |
| US-20 | Creator | Resume after a network interruption | I don't lose work silently |

## 30. Glossary

- **Portfolio:** The user's durable portfolio entity, owning draft content and publication lifecycle.
- **Draft:** Editable, private, relational content and design configuration.
- **Draft revision:** Server-authoritative number incremented atomically for each committed draft mutation.
- **Published snapshot:** Immutable, validated representation of the portfolio at a specific publication point.
- **Active published version:** The snapshot currently served to anonymous visitors.
- **Template:** Versioned rendering implementation for canonical content.
- **Design tokens:** Validated appearance values resolved into a template's visual system.
- **Slug:** Canonical unique hostname label for a portfolio.
- **Tenant isolation:** Enforcement preventing one creator from accessing another creator's private resources.
- **Entitlement/quota:** Configurable product permission or usage limit.
- **Super Admin:** Privileged platform operator with explicitly authorized administrative capabilities.
- **Transactional outbox:** Durable record of important business events to be dispatched asynchronously after database commit.
- **ADR:** Architecture Decision Record documenting a technical decision, rationale, and consequences.
- **MVP:** First production release scope, not a throwaway prototype.

## 31. Document governance and next specifications

### 31.1 Review and approval

The PRD should be reviewed for scope, business rules, privacy, moderation, and acceptance criteria before being marked **Approved**. Proposed defaults are not automatically approved merely because they appear in this document. Any change to launch scope or public behavior should update the PRD and trace into technical and test specifications.

### 31.2 Traceability to subsequent documents

| Document | Primary responsibility |
|---|---|
| `PRD.md` | Product outcomes, features, scope, business rules, acceptance criteria |
| `TRD.md` | Architecture, component boundaries, APIs, security implementation, infrastructure, NFR engineering targets |
| `APP_FLOW.md` | Detailed navigation maps, transitions, redirects, guards, and error/empty states |
| `UI_UX_DESIGN_BRIEF.md` | Screen-level layouts, responsive behavior, components, design system, interactions, accessibility |
| `BACKEND_SCHEMA.md` | Prisma entities, PostgreSQL constraints, indexes, migrations, versioning, data retention |
| `IMPLEMENTATION_PLAN.md` | Epics, milestones, dependencies, test plan, release strategy, ownership, effort estimates |

### 31.3 Required next actions

1. Review open product decisions and approve or defer them explicitly.
2. Produce the TRD and API contract conventions against this PRD.
3. Finalize executable Prisma schema and database migration/test strategy.
4. Detail app navigation and each screen's acceptance behavior.
5. Complete UI/UX brief and template-specific design specifications.
6. Validate wildcard routing, Clerk, Neon, and R2 assumptions with targeted proof-of-concept tests.
7. Produce a phased implementation plan and production launch checklist.

---

**End of PRD v1.0 — comprehensive planning baseline.**
