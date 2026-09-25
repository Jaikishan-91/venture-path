# Architecture & Engineering Decisions

## ADR-001 — Core technology stack
Date: 2026-09-25
Context: Greenfield project; product owner specified preferred technologies.
Decision: Use Next.js for the application, PostgreSQL as the database, and Grafana Loki for logging.

## ADR-002 — Plans stored in `plan/`
Date: 2026-09-25
Context: Plans need to persist across agent sessions.
Decision: Every implementation plan is saved as a file in `plan/` (see `AGENTS.md` → Project Operating Rules).

## ADR-003 — Commit on every shipped feature
Date: 2026-09-25
Context: Product owner wants Git history updated as soon as features ship.
Decision: Git repository initialized; each feature is committed once it completes the five-pillar lifecycle (see `AGENTS.md` → Project Operating Rules).

## ADR-004 — MVP boundary: discovery and application only
Date: 2026-09-25
Context: The platform could stop at matching or also handle messaging, contracts and payments; that choice drives data model, security and legal scope.
Decision: MVP covers profiles, opportunity posting, search, applying, and accept/reject. Messaging, contracts, payments and reviews are out of MVP scope.

## ADR-005 — Only MSMEs post listings in MVP
Date: 2026-09-25
Context: "Post and find" could mean both sides post listings.
Decision: In the MVP only MSMEs post opportunities (freelance or internship). Students have profiles and apply. Student service listings and a student directory are deferred.

## ADR-006 — Email verification plus admin approval of MSMEs
Date: 2026-09-25
Context: Fake or scam listings aimed at students are the main trust risk.
Decision: Every user verifies their email. An admin role approves each MSME, and an MSME's listings are not visible to students until approval.

## ADR-007 — Sign-in with email/password and Google
Date: 2026-09-25
Context: Need a sign-in method that is familiar to students and supports email verification.
Decision: Support email and password (with email verification) and Google sign-in. Auth library: Better Auth (ADR-009).

## ADR-008 — Local Docker Compose first; production hosting deferred
Date: 2026-09-25
Context: No production hosting decision yet; want no cost or lock-in during MVP build.
Decision: Develop locally with Docker Compose running Next.js, PostgreSQL, Loki and Grafana. Production hosting will be decided later and recorded as a new ADR.

## ADR-009 — Application technical stack
Date: 2026-09-25
Context: Remaining technical choices after ADR-001.
Decision: TypeScript, Next.js App Router, Prisma ORM (PostgreSQL, Prisma Migrate), Better Auth (email/password + Google), Tailwind CSS with shadcn/ui, pino for structured logging shipped to Loki, Vitest for unit/integration tests and Playwright for end-to-end tests. Package manager: npm.

## ADR-010 — Pin Prisma 7.10.0; override two vulnerable CLI dependencies
Date: 2026-09-25
Context: npm's `latest` tag for `prisma` is `8.0.0-rc.17`, but Better Auth 1.7.6 declares `prisma ^5 || ^6 || ^7`. The Prisma 7.10.0 CLI pulls in `deepmerge-ts` 7.x (GHSA-ggr8-5vv4-36mx) and a vulnerable `mysql2`; npm's suggested fix was downgrading to Prisma 6.
Decision: Pin `prisma`, `@prisma/client` and `@prisma/adapter-pg` to exactly 7.10.0. Add npm `overrides` for `mysql2 ^3.24.4` and `deepmerge-ts ^8.0.2`. Verified afterwards: `npm audit` reports 0 vulnerabilities, and `prisma validate` and `prisma generate` still work. Revisit when Better Auth supports Prisma 8.

## ADR-011 — Push logs directly to Loki with pino-loki
Date: 2026-09-25
Context: Logs could be shipped by an agent (Grafana Alloy/Promtail) or pushed by the app.
Decision: Use the `pino-loki` transport in a pino worker thread, with 2-second batching. No log agent is needed locally. Trade-off: logs buffered at shutdown or while Loki is unreachable can be lost; stdout still receives every line. Revisit for production hosting.

## ADR-012 — shadcn/ui default preset
Date: 2026-09-25
Context: shadcn/ui 4.21 offers several presets and component bases.
Decision: Use `shadcn init --defaults` (template `next`, preset `base-nova`, Base UI components). It installs the `cn` package (published by shadcn from `shadcn-ui/cn` with npm provenance) instead of `clsx` + `tailwind-merge`. `cn` is only weeks old; watch it for issues.

## ADR-013 — Role is server-owned, chosen once, never changed by users
Date: 2026-09-25
Context: Users pick student or MSME. Google sign-in has no role field. Letting clients write the role would allow self-promotion to admin (user decisions 1 and 2, Phase 1 plan).
Decision: `User.role` is a nullable enum declared to Better Auth with `input: false`, so no auth endpoint or OAuth profile can set it (Better Auth rejects it with 400). The only user-driven write is `assignInitialRole`: `student`/`msme` only, and only while the role is `null`. Email sign-up assigns it right after account creation; a user whose role is still `null` (e.g. first Google sign-in) is held on `/onboarding/role`. Admins are created only by the seed script. Changing a set role is admin-only and not built yet.

## ADR-014 — Email verification required before sign-in
Date: 2026-09-25
Context: ADR-006 requires verified emails; user decision 3 blocks unverified users entirely.
Decision: `requireEmailVerification: true`, `sendOnSignUp` and `sendOnSignIn` (a blocked sign-in re-sends the link), `autoSignInAfterVerification`. Sign-up returns the same "check your inbox" response for new and existing emails (no account enumeration). Email is sent without awaiting inside the Better Auth callback, as its docs advise. Local SMTP is Mailpit via nodemailer; production provider TBD.

## ADR-015 — Route protection in pages, proxy only as an optimisation
Date: 2026-09-25
Context: Next.js 16 renamed middleware to `proxy`. Better Auth docs say a cookie check there is not a security boundary.
Decision: `src/proxy.ts` redirects requests without a session cookie on protected paths. Every protected page and server action calls `requireSession`/`requireRole`, which validate the session against the database. Wrong-role users are redirected to their own home rather than shown a 403.

## ADR-016 — Optional profiles; MSME approval resets on change
Date: 2026-09-25
Context: Phase 2 adds student and MSME profiles and the MSME approval status (user decisions, Phase 2 plan).
Decision: Profiles are optional; dashboards prompt for one, and later phases require it where needed. `MsmeProfile.status` is server-owned: a new profile is `pending`; saving a changed `approved` profile returns it to `pending` (its listings will be hidden until re-approved); saving a `rejected` profile resubmits it as `pending`. The save updates conditionally on the status it read, so a concurrent admin decision is never overwritten. Skills are free-form tags, lowercased and de-duplicated. Profile links and websites must be `http`/`https` URLs. The student's name stays on `User.name`. Review metadata (reviewer, time, reason) is left to Phase 3.

## ADR-017 — nodemon only for changes Next.js can't hot-reload
Date: 2026-09-25
Context: The user wants UI and backend changes visible live. Next.js already hot-reloads everything in `src/`, but the Prisma client, the Better Auth instance and parsed env are cached per process, so schema and `.env` changes needed a manual restart (seen after the Phase 2 migration).
Decision: `npm run dev` wraps `prisma generate && next dev` in nodemon, watching only `prisma/schema.prisma`, `prisma7.config.ts` and `.env`. `src/` is not watched by nodemon: restarting on every save would be slower and lose Fast Refresh state.

## ADR-018 — Generic SMTP with login; test domains stay on the mail catcher
Date: 2026-09-25
Context: The user wants real email and chose Gmail SMTP (`smtp.gmail.com`). E2E tests sign up `@e2e.venturepath.local` users and read verification links from Mailpit, and only one `next dev` can run per project, so tests and manual use share one mail configuration.
Decision: `src/lib/email.ts` stays provider-agnostic nodemailer SMTP, with optional `SMTP_USER`/`SMTP_PASSWORD` and TLS (`secure` on 465, `requireTLS` otherwise when logging in). Outside production, recipients on RFC 2606/6761 reserved domains (`.local`, `.test`, `.example`, `.invalid`) are sent to `MAIL_CATCHER_URL` (Mailpit), since they can never be delivered. Gmail limits: personal accounts send roughly 500 messages a day and Gmail rewrites the From header to the authenticated account unless it is a verified alias, so this is for development, not production. Production provider remains TBD.

## ADR-019 — Admin MSME review: any status, reason required, stale-safe
Date: 2026-09-25
Context: Phase 3 user decisions: email the MSME on each decision, admins can decide from any status, list all MSMEs by status, rejection reason required.
Decision: `reviewMsme` sets `status`, `reviewedById`, `reviewedAt` and `rejectionReason` (cleared on approval) with one conditional update: `updatedAt` must equal the value rendered on the admin page and the status must change. An MSME edit made after the page loaded, a second admin's decision, or a double submit is refused with "changed, review again", so admins never approve content they haven't seen. The decision email is sent after the update without awaiting; a failed email is logged and doesn't undo the decision. The review fields describe the last decision and are kept when an edit resets the status to `pending`.

## ADR-020 — Listings: approval-gated writes, reversible close, India-time deadlines
Date: 2026-09-25
Context: Phase 4 user decisions on pay, location, who can list, revoked MSMEs, lifecycle and deadlines.
Decision: `Opportunity` stores structured pay (`payType`; `payAmount` whole INR and `payPeriod` only when paid; unpaid only for internships) and `workMode` with a city required unless remote. Only approved MSMEs create, edit, publish or reopen; closing and deleting drafts are always allowed because they only reduce exposure. Lifecycle draft → published ⇄ closed; only drafts are deleted. Listings of an MSME that loses approval keep their status and are hidden by the Phase 5 visibility rule (published + approved MSME + deadline not passed). Deadlines are dates (last day to apply) compared with today in Asia/Kolkata; saving a past deadline and publishing/reopening after it has passed are refused. All writes are scoped to the session user's MSME profile, and status changes are conditional on the expected current status.
## ADR-021 — Public browse with local embeddings and pgvector
Date: 2026-09-25
Context: Phase 5 user decisions: anyone can browse, city dropdown of current listings, semantic search, a detail page, a type filter, newest first when there is no query. The user chose pgvector with a local model and hybrid keyword ranking.
Decision: Postgres runs as `pgvector/pgvector:0.8.6-pg18-trixie`. Listing text (title, type, skills, description) is embedded with Transformers.js `onnx-community/all-MiniLM-L6-v2-ONNX` (384 dimensions, mean pooling, normalised) and stored in `opportunity.embedding` with an HNSW cosine index. The model downloads once into `.cache/models`. A failed embedding does not fail the save; `npm run embeddings:backfill` repairs it. A query ranks by cosine similarity plus a keyword bonus (title 0.3, skills 0.25, business name 0.2, description 0.1); a result must score at least 0.3 similarity or have a keyword match. Without a query, results are newest published first. Every public query also enforces the visibility rule. The detail page shows the business profile but never the owner's name or email.
## ADR-022 — Applications: private resumes, one row, contact after acceptance
Date: 2026-09-25
Context: Phase 6 user decisions: both emails on acceptance, required resume file, optional note, withdraw and reapply, emails on apply and on decision.
Decision: One application row per student per listing. Withdrawing sets `withdrawn`; applying again updates that row and replaces the file. Accept and reject only move a `submitted` row, and only for the owning MSME. Resume files are stored under `uploads/resumes` with a generated key, git-ignored, and downloaded only by the student or that MSME. Sign-in emails are rendered only when the status is `accepted`. The note is optional and at most 1000 characters. Allowed resumes are PDF, DOC and DOCX up to 5 MB.
## ADR-023 — LLM through one OpenAI-compatible endpoint, optional
Date: 2026-09-26
Context: Phase 7 adds AI resume analysis. The user wants OpenAI-compatible endpoints first (OpenAI, Gemini's OpenAI mode, Ollama). Recorded after the fact, when Phase 7 was hardened.
Decision: `src/lib/llm/` calls `POST {LLM_BASE_URL}/chat/completions` with `fetch` (no SDK). `LLM_PROVIDER` is `disabled` (default) or `openai`. Any invalid setting (unknown provider, missing base URL) is logged and treated as disabled, so AI features never break a page. Calls time out after 30 s and return null on any failure. Prompts are admin-editable rows in `prompt`, falling back to built-in defaults. Tests force `LLM_PROVIDER=disabled` and stub `fetch`, so they never call a paid API. `LLM_FALLBACK_MODEL` is read but not used yet.

## ADR-024 — Resume analysis: one row per application, owner-triggered, text as data
Date: 2026-09-26
Context: The user decided PDF text extraction is included ("lightweight parser, pdf-parse"). `pdf-parse` 2.x requires the native `@napi-rs/canvas`, which is a risk on the Alpine Docker image.
Decision: Text comes from `unpdf` 1.8.1 for PDF (pure JS, no required dependencies), a built-in ZIP reader for DOCX, and printable runs for legacy DOC. Analysis runs in the background after each (re)application, and on demand only by the MSME that owns the listing. The result is upserted: one `analysis` row per application, replaced on re-analysis. The LLM gets a system message saying the listing and resume are data, and the resume is wrapped in `<resume>` tags (tags inside the text are stripped) and cut at 12,000 characters. The score is rounded to an integer and must be 0–100; anything else is a parse error and nothing is stored.

## ADR-025 — Rename MSME to organisation and student to user, everywhere
Date: 2026-09-26
Context: The product owner asked for "organisation" and "user" everywhere, including code and database.
Decision: Role values `user` / `organisation` / `admin`; models `UserProfile` / `OrganisationProfile`; enum `OrganisationStatus`; routes `/user`, `/organisation`, `/admin/organisations`. The database is renamed in place by migration `rename_roles` (`ALTER TYPE … RENAME VALUE` plus table, column, key and index renames), so existing rows, sessions and roles survive; `prisma migrate diff` from the database to the schema is empty. Old URLs redirect permanently. Earlier ADRs and changelog entries keep the old names as history. `User` (every account) and the `user` role now share a word: code uses `userProfile` for the role's profile and `applicantUserId` where an applicant's account ID is meant.

## ADR-026 — Separate sign-in and sign-up pages per role
Date: 2026-09-26
Context: The product owner wants different sign-in and sign-up pages for users, organisations and the admin; each sign-in page accepts only its own role; admins are still created only by the seed script (ADR-013).
Decision: `/sign-in` + `/sign-up` (user), `/organisation/sign-in` + `/organisation/sign-up`, `/admin/sign-in` (no sign-up, no Google). Password sign-in runs in a server action that verifies the password first, so a wrong password never reveals an account's role; the right password on the wrong page deletes the new session and names the right page. Accounts without a role take the page's role (never admin). Google sign-in returns through `/auth/continue?as=<role>`, which does the same check. The proxy sends signed-out visitors to the sign-in page for the area they asked for. The per-page role check is a UX rule, not an authorization boundary: Better Auth's own `/api/auth/sign-in/email` endpoint still signs anyone in, and every protected page and action keeps enforcing `requireRole`.

## ADR-027 — Toast notifications for all feedback
Date: 2026-09-26
Context: The product owner wants every alert and notification shown as a toast that matches the app (NFR-3), working on phones and desktops (NFR-4).
Decision: `sonner` 2.0.8, one `<AppToaster>` in the root layout, top-centre, themed with the app tokens (card surface, forest-green success, terracotta errors, `--radius`, Geist). Form errors returned by server actions become toasts through `useActionErrorToast`; inline error paragraphs are gone. Success messages, and outcomes of actions that redirect or return nothing, are queued by `flash()` in a short-lived `vp-flash` cookie (not HttpOnly, 60 s, no secrets); the root layout passes it to the toaster, which also reads it in the browser after each route change, shows it once per id, and deletes it. Persistent page state (an organisation's review status, "listings are hidden") stays inline, because it is not a notification.

## ADR-028 — Docker development with Compose watch
Date: 2026-09-26
Context: The product owner wants code changes to show up in the Docker app without rebuilding. The Next.js docs warn that Docker Desktop bind mounts on Windows and macOS can drop file events and advise against polling.
Decision: A `dev` stage in the Dockerfile and a `next-dev` service (profile `dev`) using Compose `develop.watch`. Compose watches the host and syncs `src/` and `prisma/` into the container, so `next dev` and nodemon get normal file events; config files restart the container; `package.json` or the lockfile rebuild it. The production `next` service moves to profile `prod`, so the two never both bind port 3000. `.env` and host build output are now in `.dockerignore`: images never contain secrets, and `.env` changes need the container recreated. `npm run docker:dev` and `npm run docker:prod` wrap the commands. All stages use `node:22-bookworm-slim`: the Alpine base broke `onnxruntime-node` (glibc only), so embeddings never worked in Docker. The dev container mounts the host's `.cache/models`, so it reuses the model instead of downloading it.
