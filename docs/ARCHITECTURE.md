# Architecture

Status: MVP phases 0–6 and Phase 7 (AI resume analysis) implemented; Phase 7 hardened on 2026-09-26.

System Overview:
A TypeScript Next.js 16 (App Router, Turbopack) web application backed by PostgreSQL through Prisma 7, with structured pino logs pushed directly to Grafana Loki. Local development runs the supporting services in Docker Compose.

Components:
- **Web app (Next.js App Router)** — UI (Tailwind 4 + shadcn/ui) and server logic (route handlers and server actions).
- **Auth (Better Auth 1.7.6)** — email/password with required email verification, Google sign-in when configured, database sessions via the Prisma adapter. Roles user / organisation / admin (ADR-013 to ADR-015; renamed from student / MSME by ADR-025). Each role has its own sign-in page, and users and organisations have their own sign-up pages (ADR-026).
- **Access control** — `src/proxy.ts` does an optimistic session-cookie redirect; the real checks are `requireSession` / `requireRole` in `src/lib/authz.ts`, called by every protected page and action.
- **Email** — nodemailer over SMTP (`src/lib/email.ts`). Any SMTP server with optional login (Gmail configured locally); Mailpit by default. Outside production, reserved test domains always go to Mailpit (ADR-018). Production provider not chosen.
- **Database (PostgreSQL 18 + Prisma 7)** — system of record. The Docker image is `pgvector/pgvector` (Postgres 18 with pgvector). Prisma uses the `@prisma/adapter-pg` driver adapter; schema changes go through Prisma Migrate. See `docs/DATA_MODEL.md`.
- **Search** — public listing search in `src/lib/search.ts`: filters plus hybrid ranking (pgvector cosine similarity and keyword matches). Embeddings come from a local model in `src/lib/embeddings.ts` (ADR-021).
- **AI resume analysis (optional)** — `src/lib/llm/` calls any OpenAI-compatible chat endpoint when `LLM_PROVIDER=openai` (ADR-023). `src/lib/resume-analysis.ts` extracts resume text (PDF via `unpdf`, DOCX, DOC) and scores each application: the resume against the listing, and the screening answers (`src/lib/answer-scoring.ts`), combined into one `Analysis` per application (ADR-024, ADR-033). Prompts are editable at `/admin/settings`.
- **Resume library, listing assist and recommendations** — `src/lib/resume-library.ts` stores up to 5 resumes per user and extracts their skills (ADR-031). `src/lib/listing-assist.ts` adds AI skills and draft screening questions to listings (ADR-032). `src/lib/recommendations.ts` ranks visible listings by skill coverage plus embedding similarity (ADR-033). Everything degrades to non-AI behaviour when no LLM is configured.
- **Logging (pino → pino-loki → Loki → Grafana)** — structured JSON logs with labels `app`, `env`, `level`. Secrets are redacted by path.
- **Local dev services (Docker Compose)** — Postgres, Loki, Grafana (Loki data source provisioned) and Mailpit. The app itself runs on the host (`npm run dev`), in Docker with live code sync (`npm run docker:dev`, profile `dev`), or as the production image (`npm run docker:prod`, profile `prod`) (ADR-028).

Data Flow:
User (browser) → Next.js (UI + server logic) → Prisma (`PrismaPg` adapter) → PostgreSQL
Next.js → pino → stdout (pretty in development) and pino-loki worker thread → Loki push API → Grafana

## Code layout

| Path | Purpose |
|------|---------|
| `src/app/` | Routes (App Router). `api/health/route.ts` is the health check; `api/auth/[...all]` is Better Auth; `(auth)/` holds sign-in and sign-up; `onboarding/role`, `dashboard`, `user`, `organisation`, `admin` are protected pages. |
| `src/proxy.ts` | Optimistic redirect to `/sign-in` when there is no session cookie. |
| `src/lib/auth.ts` | `getAuth()` — Better Auth server instance. `auth-client.ts` is the browser client. |
| `src/lib/authz.ts` | `getSession`, `requireSession`, `requireRole` (server only). |
| `src/lib/roles.ts` | Role constants, sign-up role schema, home, sign-in and sign-up paths per role. |
| `src/lib/role-sign-in.ts` | `signInWithRole`: email/password sign-in that refuses another role's page (ADR-026). |
| `src/app/auth/continue/route.ts` | Role check and assignment after Google sign-in. |
| `src/lib/user-roles.ts` | `assignInitialRole` — the only user-driven write to `User.role`. |
| `src/lib/profile-schemas.ts` | Profile validation (zod) and the organisation status rule `nextOrganisationStatus` (pure). |
| `src/lib/profiles.ts` | Profile reads and writes; derives `OrganisationProfile.status` (ADR-016). |
| `src/lib/email.ts` | `sendEmail` over SMTP. |
| `src/lib/flash.ts`, `src/lib/flash-shared.ts` | `flash()` queues a toast for the next render (ADR-027). |
| `src/components/app-toaster.tsx`, `use-action-error-toast.ts` | The themed toaster and the form-error toast hook. |
| `src/lib/llm/` | LLM config (`config.ts`), OpenAI-compatible client (`provider.ts`), prompt templates and defaults (`prompts.ts`, `defaults.ts`). |
| `src/lib/resume-analysis.ts` | Resume text extraction and analysis; `reanalyzeForOrganisation` checks listing ownership. |
| `src/lib/prompts.ts` | `updatePrompt` (admin). |
| `src/lib/skills.ts` | Skill normalisation, coverage, match and combined-score maths (pure). |
| `src/lib/resume-library.ts` | Resume library (cap, ownership, file references), skill extraction, `candidateSkills`. |
| `src/lib/listing-assist.ts` | AI skills and draft questions for a listing. |
| `src/lib/answer-scoring.ts` | Scores screening answers in one LLM call. |
| `src/lib/recommendations.ts` | Skill-based job recommendations. |
| `src/lib/applicant-filters.ts` | Applicants page filter parsing (pure). |
| `src/lib/llm/json.ts` | JSON reply parsing and `asData` tag wrapping for LLM input. |
| `src/lib/background.ts` | `runInBackground` (logged, never thrown) and `settleBackground` for tests. |
| `src/lib/dashboard/` | Dashboard data per role (`user.ts`, `organisation.ts`, `admin.ts`), plus `dates.ts` (7/30-day windows, India-date ranges) and `statuses.ts` (ADR-029). |
| `src/components/dashboard/` | Dashboard UI: `StatTile`, `StatGrid`, `DashboardSection`/`EmptyState`, `BarList`, `StatusPill`. |
| `src/components/app-sidebar.tsx` | Role navigation: a sidebar from `md`, a tab bar on phones. Links are listed in `NAV`. |
| `src/lib/env.ts` | Validates server environment variables with zod; `getEnv()` caches the result. |
| `src/lib/db.ts` | `getDb()` — single Prisma client, reused across hot reloads. |
| `src/lib/logger.ts` | `getLogger()` — single pino logger with redaction and transports. |
| `src/lib/utils.ts`, `src/components/ui/` | shadcn/ui helpers and components. |
| `src/generated/prisma/` | Generated Prisma client (git-ignored; created by `npm install` / `npm run db:generate`). |
| `prisma/schema.prisma`, `prisma7.config.ts`, `prisma/migrations/` | Prisma schema, CLI config and migrations. |
| `prisma/seed.ts` | Creates the admin account (`npm run db:seed`). |
| `docker-compose.yml`, `docker/` | Local services and Grafana provisioning. |
| `tests/` | Vitest unit and integration tests. |
| `e2e/` | Playwright end-to-end tests. |

## Adding a dashboard stat or nav link

1. Add the query to the role's `get<Role>Dashboard` in `src/lib/dashboard/<role>.ts`, inside its `Promise.all`, scoped like the others, and add the field to the returned type.
2. Render it on the role's page (`src/app/<role>/page.tsx`) with a `StatTile` in the `StatGrid` (keep rows of four), or in a `DashboardSection`.
3. Test it in `tests/dashboard-<role>.test.ts`. The test database is shared by files running in parallel: assert on your own fixtures or on invariants, not global totals.
4. Nav links: add one line to `NAV` in `src/components/app-sidebar.tsx`. Keep a role to 4–5 links so the phone tab bar fits at 320px.

## Local ports (all bound to 127.0.0.1)

App 3000, Grafana 3001, Loki 3100, PostgreSQL 5432, Mailpit SMTP 1025 and web 8025.

Open architecture decisions (record in `docs/DECISIONS.md` when made):
- Production hosting / deployment target (local development uses Docker Compose — ADR-008).
- Production email provider.
- File storage (e.g. resumes, logos), if needed.
