# Architecture

Status: Phase 0 (foundation) and Phase 1 (authentication) implemented on 2026-09-25.

System Overview:
A TypeScript Next.js 16 (App Router, Turbopack) web application backed by PostgreSQL through Prisma 7, with structured pino logs pushed directly to Grafana Loki. Local development runs the supporting services in Docker Compose.

Components:
- **Web app (Next.js App Router)** — UI (Tailwind 4 + shadcn/ui) and server logic (route handlers and server actions).
- **Auth (Better Auth 1.7.6)** — email/password with required email verification, Google sign-in when configured, database sessions via the Prisma adapter. Roles student / msme / admin (ADR-013 to ADR-015).
- **Access control** — `src/proxy.ts` does an optimistic session-cookie redirect; the real checks are `requireSession` / `requireRole` in `src/lib/authz.ts`, called by every protected page and action.
- **Email** — nodemailer over SMTP (`src/lib/email.ts`). Any SMTP server with optional login (Gmail configured locally); Mailpit by default. Outside production, reserved test domains always go to Mailpit (ADR-018). Production provider not chosen.
- **Database (PostgreSQL 18 + Prisma 7)** — system of record. The Docker image is `pgvector/pgvector` (Postgres 18 with pgvector). Prisma uses the `@prisma/adapter-pg` driver adapter; schema changes go through Prisma Migrate. See `docs/DATA_MODEL.md`.
- **Search** — public listing search in `src/lib/search.ts`: filters plus hybrid ranking (pgvector cosine similarity and keyword matches). Embeddings come from a local model in `src/lib/embeddings.ts` (ADR-021).
- **Logging (pino → pino-loki → Loki → Grafana)** — structured JSON logs with labels `app`, `env`, `level`. Secrets are redacted by path.
- **Local dev services (Docker Compose)** — Postgres, Loki, Grafana (Loki data source provisioned) and Mailpit.

Data Flow:
User (browser) → Next.js (UI + server logic) → Prisma (`PrismaPg` adapter) → PostgreSQL
Next.js → pino → stdout (pretty in development) and pino-loki worker thread → Loki push API → Grafana

## Code layout

| Path | Purpose |
|------|---------|
| `src/app/` | Routes (App Router). `api/health/route.ts` is the health check; `api/auth/[...all]` is Better Auth; `(auth)/` holds sign-in and sign-up; `onboarding/role`, `dashboard`, `student`, `msme`, `admin` are protected pages. |
| `src/proxy.ts` | Optimistic redirect to `/sign-in` when there is no session cookie. |
| `src/lib/auth.ts` | `getAuth()` — Better Auth server instance. `auth-client.ts` is the browser client. |
| `src/lib/authz.ts` | `getSession`, `requireSession`, `requireRole` (server only). |
| `src/lib/roles.ts` | Role constants, sign-up role schema, home path per role. |
| `src/lib/user-roles.ts` | `assignInitialRole` — the only user-driven write to `User.role`. |
| `src/lib/profile-schemas.ts` | Profile validation (zod) and the MSME status rule `nextMsmeStatus` (pure). |
| `src/lib/profiles.ts` | Profile reads and writes; derives `MsmeProfile.status` (ADR-016). |
| `src/lib/email.ts` | `sendEmail` over SMTP. |
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

## Local ports (all bound to 127.0.0.1)

App 3000, Grafana 3001, Loki 3100, PostgreSQL 5432, Mailpit SMTP 1025 and web 8025.

Open architecture decisions (record in `docs/DECISIONS.md` when made):
- Production hosting / deployment target (local development uses Docker Compose — ADR-008).
- Production email provider.
- File storage (e.g. resumes, logos), if needed.
