# Architecture

Status: Phase 0 (foundation) implemented on 2026-09-25. No product features yet.

System Overview:
A TypeScript Next.js 16 (App Router, Turbopack) web application backed by PostgreSQL through Prisma 7, with structured pino logs pushed directly to Grafana Loki. Local development runs the supporting services in Docker Compose.

Components:
- **Web app (Next.js App Router)** — UI (Tailwind 4 + shadcn/ui) and server logic (route handlers; server actions later).
- **Auth (Better Auth)** — planned for Phase 1: email/password with email verification, Google sign-in, roles student / msme / admin.
- **Database (PostgreSQL 18 + Prisma 7)** — system of record. Prisma uses the `@prisma/adapter-pg` driver adapter; schema changes go through Prisma Migrate. No models yet.
- **Logging (pino → pino-loki → Loki → Grafana)** — structured JSON logs with labels `app`, `env`, `level`. Secrets are redacted by path.
- **Local dev services (Docker Compose)** — Postgres, Loki, Grafana (Loki data source provisioned) and Mailpit.

Data Flow:
User (browser) → Next.js (UI + server logic) → Prisma (`PrismaPg` adapter) → PostgreSQL
Next.js → pino → stdout (pretty in development) and pino-loki worker thread → Loki push API → Grafana

## Code layout

| Path | Purpose |
|------|---------|
| `src/app/` | Routes (App Router). `api/health/route.ts` is the health check. |
| `src/lib/env.ts` | Validates server environment variables with zod; `getEnv()` caches the result. |
| `src/lib/db.ts` | `getDb()` — single Prisma client, reused across hot reloads. |
| `src/lib/logger.ts` | `getLogger()` — single pino logger with redaction and transports. |
| `src/lib/utils.ts`, `src/components/ui/` | shadcn/ui helpers and components. |
| `src/generated/prisma/` | Generated Prisma client (git-ignored; created by `npm install` / `npm run db:generate`). |
| `prisma/schema.prisma`, `prisma7.config.ts` | Prisma schema and CLI config. |
| `docker-compose.yml`, `docker/` | Local services and Grafana provisioning. |
| `tests/` | Vitest unit and integration tests. |
| `e2e/` | Playwright end-to-end tests. |

## Local ports (all bound to 127.0.0.1)

App 3000, Grafana 3001, Loki 3100, PostgreSQL 5432, Mailpit SMTP 1025 and web 8025.

Open architecture decisions (record in `docs/DECISIONS.md` when made):
- Production hosting / deployment target (local development uses Docker Compose — ADR-008).
- Production email provider.
- File storage (e.g. resumes, logos), if needed.
