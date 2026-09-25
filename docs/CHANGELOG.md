# Changelog

## 2026-09-25 — Careers UI

Restyled the product as a hiring portal: forest-green and cream tokens, Newsreader headlines, a framed public layout, and a sidebar for signed-in student, MSME, and admin pages. Routes, form fields, and existing action labels are unchanged.

## 2026-09-25 — Dockerization
Added:
- `Dockerfile` with multi-stage build: Alpine + Node deps, builder stage with `prisma generate` and `next build`, production standalone runner.
- `next` service in `docker-compose.yml` — builds the app image, exposes port 3000, uses an `hf-cache` volume for the HuggingFace model cache.
- `.dockerignore`.
- `next.config.ts` uses `output: "standalone"` for Docker.
- README updated with full Docker setup instructions and migration/seed commands.

Fixed:
- Dockerfile uses Node.js 22-alpine (project deps require Node.js >= 22, not 20).
- `npm ci` now runs after copying `prisma/schema.prisma` so the `postinstall` hook (`prisma generate`) can find the schema.
- `src/lib/resume-analysis.ts`: fixed invalid `interface` union syntax to `type` alias.
- `src/lib/llm/provider.ts`: fixed `res.text().slice()` to `(await res.text()).slice()`.
- `src/lib/llm/prompts.ts`: added `as PromptTemplate[]` cast for `getAllPrompts` return type.
- `src/lib/resume-analysis.ts`: fixed `LlmMessage` import (moved from `prompts.ts` to `provider.ts`).
- `src/app/admin/settings/prompt-editor.tsx`: client component for prompt editing. `"use client"` must be the first statement, so it cannot sit inside the server page.
- Dockerfile runner stays root for `COPY` and `chown`, creates an empty `public/` when the repo has none, and copies the Prisma client from `src/generated/prisma`.
- Dockerfile copies `pino-loki` and its runtime dependencies into the runner image. Pino loads that transport by package name, so the standalone trace omits it and every request 500s.
- The `next` service sets `LOKI_URL=http://loki:3100`. The value in `.env` (`localhost:3100`) is for `npm run dev` on the host.
- The `next` service rewrites `DATABASE_URL`, `SMTP_HOST`, and `MAIL_CATCHER_URL` to the Compose service names. `localhost` inside the app container is the app itself, so Prisma was refusing the connection and `/opportunities` returned 500.
- `src/app/msme/opportunities/[id]/applicants/actions.ts`: added missing `decideAction` server action.
- Test files: updated mock opportunity objects with new `requirements`/`experienceLevel`/`compensationMin`/`compensationMax` fields.

## 2026-09-25 — Phase 7: LLM resume analysis

### 1. Environment config
- Added `LLM_PROVIDER` (`"openai"`, `"azure"`, `"anthropic"`, `""`), `OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `ANTHROPIC_API_KEY` env vars to `.env.example` and `z.env.ts`. No provider configured locally by default — resume analysis is silently skipped.

### 2. LLM provider client
- `src/lib/llm/provider.ts` exports `createLlmClient()` — returns an OpenAI-compatible client or `null` when unconfigured. Supports OpenAI, Azure OpenAI, and Anthropic (mapped to the OpenAI-compatible Messages API).

### 3. Prompt management
- `src/lib/llm/prompts.ts` exports `buildPrompt(key, context)` with `resume_analysis` and `job_description` templates, `{{placeholder}}` replacement, and `getPromptContent()` which reads the editable `prompt` table and falls back to a built-in default.

### 4. Resume analysis service
- `src/lib/resume-analysis.ts` exports `analyzeApplication(applicationId, opportunity)` — checks the LLM client exists, reads and truncates the resume text, builds the prompt, calls the LLM, parses the JSON result, and stores a row in the `analysis` table.

### 5. Application flow wiring
- Submitting an application triggers background analysis (via `Promise.resolve().then(...)` to avoid awaiting inside the action). If no LLM is configured, analysis is skipped gracefully.

### 6. Admin settings page
- `/admin/settings` lets admins edit the `resume_analysis` and `job_description` prompt contents. Prompted via the `prompt` table.

### 7. Resume analysis UI
- `src/app/msme/opportunities/[id]/applicants/resume-analysis.tsx` fetches the analysis and shows a score badge, summary, matched/missing skills, and a "Re-analyze" button (server action) when an LLM is available.

### 8. Opportunity form extensions
- Added `requirements` (textarea, optional, max 2000 chars), `experienceLevel` (select: entry/junior/mid/senior/lead), and `compensationMin`/`compensationMax` (whole rupees, optional) to the listing form, schema, edit page, and new page.

### 9. Opportunity detail display
- The browse-side `/opportunities/[id]` page now displays requirements, experience level, and compensation range (₹ formatted) when present.

### 10. Database
- Migration `phase7_llm_resume_analysis`: `prompt` table, `analysis` table, `ExperienceLevel` enum, `requirements`/`experienceLevel`/`compensationMin`/`compensationMax` columns on `opportunity`. Seed prompts for `resume_analysis` and `job_description`.

### 11. Tests
- E2E browse spec extended to fill and assert the new optional fields (requirements, experience level, compensation range).

## 2026-09-25 — Phase 6: Applications
Added:
- Students apply to a visible listing with a resume (PDF, DOC or DOCX, up to 5 MB) and an optional note. A profile is required. Withdrawing allows applying again; an accepted or rejected application cannot be withdrawn.
- MSMEs review applicants at `/msme/opportunities/[id]/applicants` and accept or reject. Emails are hidden until acceptance, then both sides see them.
- The MSME is emailed on a new application; the student is emailed on a decision.
- Resumes are stored outside the public folder (`uploads/resumes`, git-ignored) and downloaded only by the student or the owning MSME.
- Students track applications at `/student/applications`.

## 2026-09-25 — Phase 5: Browse and search
Added:
- Public `/opportunities` (search, type, work mode, city, pagination) and `/opportunities/[id]`. Home page and the student dashboard link to them.
- Postgres image switched to `pgvector/pgvector:0.8.6-pg18-trixie`. Migration `search_embeddings` enables `vector`, adds `opportunity.embedding vector(384)` and an HNSW cosine index.
- Local embeddings with `@huggingface/transformers` (`all-MiniLM-L6-v2`, cached in `.cache/models`). Hybrid ranking: semantic similarity plus keyword matches on title, skills, business name and description (ADR-021).
- `npm run embeddings:backfill` fills listings saved while embedding failed.
- Tests: search-parameter unit tests; search integration tests (visibility, filters, semantic match, keyword ranking) against the real model; Playwright browse flow.

## 2026-09-25 — Phase 4: Opportunities
Added:
- Migration `opportunities`: `opportunity` table and enums `OpportunityType`, `OpportunityStatus`, `WorkMode`, `PayType`, `PayPeriod`.
- `/msme/opportunities` (own listings with status, pay, location, deadline and actions), `/msme/opportunities/new`, `/msme/opportunities/[id]/edit`. MSME dashboard links to them.
- Approved MSMEs create drafts, publish, edit, close, reopen; drafts can be deleted. Pending/rejected MSMEs can only close and delete drafts (ADR-020).
- Validation in `src/lib/opportunity-schemas.ts`: pay rules (unpaid internships only, whole INR amount, period), city unless remote, deadline not in the past (India time).
- Tests: validation, deadline and pay-format unit tests; listing integration tests (approval, ownership, transitions, deadline, delete); Playwright listing flows.

Fixed:
- Text encoding: a PowerShell rewrite had added byte-order marks to `src/lib/env.ts`, `src/lib/email.ts`, `tests/env.test.ts`, `tests/email.test.ts` and garbled the dashes in the Phase 3 plan; restored to plain UTF-8.
- Flaky Phase 3 E2E step that reloaded the MSME page before the admin's re-approval finished.

## 2026-09-25 — Phase 3: Admin approval of MSMEs
Added:
- Migration `msme_review`: `reviewedById`, `reviewedAt`, `rejectionReason` on `msme_profile`.
- `/admin/msmes` with Pending / Approved / Rejected tabs and counts; approve, reject (reason required) and revoke. `/admin` shows the pending count.
- Decisions are refused if the MSME edited its profile after the admin opened the page (ADR-019).
- The MSME gets an email on each decision (with the reason when rejected) and sees the reason on its dashboard.
- Tests: review schema and integration tests; Playwright approve, reject-with-reason, re-approve and access tests reading decision emails from Mailpit.

## 2026-09-25 — Real email over SMTP (Gmail)
Changed:
- `src/lib/email.ts` supports SMTP login and TLS: new optional env vars `SMTP_USER`, `SMTP_PASSWORD` (set together), `SMTP_SECURE` (defaults to true on port 465; otherwise STARTTLS is required when logging in), and `MAIL_CATCHER_URL` (default `smtp://localhost:1025`).
- Outside production, mail to `.local`/`.test`/`.example`/`.invalid` addresses goes to Mailpit even when real SMTP is configured, so E2E tests keep working (ADR-018).
- `npm run email:test -- <address>` sends a test email and reports which route it used.
- Local `.env` sends through `smtp.gmail.com:587`; checked by a delivered test email.

## 2026-09-25 — Dev live reload
Changed:
- `npm run dev` runs `next dev` under nodemon 3.1.14 (`nodemon.json`), which regenerates the Prisma client and restarts the server when `prisma/schema.prisma`, `prisma7.config.ts` or `.env` changes. `src/` stays on Next.js hot reload. Plain `next dev` is `npm run dev:next`.

## 2026-09-25 — Phase 2: Profiles
Added:
- Migration `profiles`: `student_profile`, `msme_profile` tables and the `MsmeStatus` enum (`pending`, `approved`, `rejected`).
- `/student/profile` and `/msme/profile` create/edit pages; dashboards show the profile or a "complete your profile" prompt, and the MSME's review status.
- MSME status rules (ADR-016): new profile is pending; editing an approved profile sends it back to pending; saving a rejected profile resubmits it.
- Validation in `src/lib/profile-schemas.ts` (skills as comma-separated tags, links one per line, http/https only); data access in `src/lib/profiles.ts`.
- shadcn `Textarea`.
- Tests: validation and status-rule unit tests, profile integration tests, Playwright profile flows. Shared `signUp` E2E helper moved to `e2e/helpers.ts`.

## 2026-09-25 — Google sign-in enabled
Changed:
- Google OAuth credentials configured locally (B-003 resolved). `client_secret_*.json` git-ignored.
- A failed Google sign-in returns to `/sign-in?error=google` with an explanation instead of Better Auth's error page.
- E2E: Google button redirects to Google with the configured client ID and callback URI; error message test.
- R-001 closed: Better Auth already refuses to link Google to an unverified local account.

## 2026-09-25 — Phase 1: Authentication
Added:
- Better Auth 1.7.6 with the Prisma adapter: email/password sign-up and sign-in, required email verification (sent via nodemailer to Mailpit locally), Google sign-in when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set.
- First migration `init_auth`: `user`, `session`, `account`, `verification` tables and the `Role` enum.
- Roles student / msme / admin: chosen at sign-up or on `/onboarding/role`, fixed once set, admin only via `npm run db:seed` (ADR-013).
- Pages: `/sign-up`, `/sign-in`, `/onboarding/role`, `/dashboard`, and placeholder `/student`, `/msme`, `/admin` homes. Home page links to sign-in/up.
- `src/proxy.ts` session-cookie redirect; server-side `requireSession`/`requireRole` (ADR-015).
- New env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (seed only).
- Tests: role and env unit tests, auth integration tests, Playwright auth flows using Mailpit's API.
- Dependencies: `better-auth`, `nodemailer`; dev: `@types/nodemailer`, `tsx`. shadcn `Input`, `Label`, `Card`.

## 2026-09-25 — Phase 0: Foundation
Added:
- Next.js 16.3.6 app (TypeScript, App Router, Tailwind 4, ESLint) with a VenturePath placeholder home page.
- shadcn/ui initialized (`components.json`, `Button`, `cn` helper).
- Docker Compose: PostgreSQL 18.6, Loki 3.7.8, Grafana 13.2.2 (Loki data source provisioned), Mailpit 1.31.2. All ports bound to 127.0.0.1.
- Prisma 7.10.0 with the `PrismaPg` driver adapter (`src/lib/db.ts`), config in `prisma7.config.ts`. No models yet.
- Environment validation with zod (`src/lib/env.ts`) and `.env.example`.
- pino logger with secret redaction, sending to stdout and to Loki via pino-loki (`src/lib/logger.ts`).
- `GET /api/health` database health check.
- Vitest (unit and integration) and Playwright (end-to-end) with smoke tests.
- Prettier, `.gitattributes` (LF line endings), `README.md` with setup steps.
- npm overrides for `mysql2` and `deepmerge-ts` to clear Prisma CLI advisories (ADR-010).

## 2026-09-25 — Project setup
Added:
- Project documentation filled in (project, requirements, architecture, constraints, data model, API, roadmap, decisions, blockers).
- Project operating rules in `AGENTS.md`: plans stored in `plan/`, Git commit on every shipped feature, `/grill-me` usage.
- `plan/` directory.
- Git repository initialized with `.gitignore`.
- MVP decisions ADR-004 to ADR-009 (scope, MSME-only listings, verification, sign-in, local Docker, tech stack).
- MVP initial plan: `plan/2026-09-25-mvp-initial-plan.md`.
