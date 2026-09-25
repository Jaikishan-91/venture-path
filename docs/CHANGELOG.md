# Changelog

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
