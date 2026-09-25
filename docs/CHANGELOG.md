# Changelog

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
