# Changelog

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
