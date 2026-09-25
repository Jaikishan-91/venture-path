# Implementation Plan — Phase 0: Foundation

Status: shipped (2026-09-25)
Date: 2026-09-25
Parent plan: `plan/2026-09-25-mvp-initial-plan.md`

## Objective

Create a runnable, tested project skeleton: Next.js + TypeScript app, local services in Docker Compose, Prisma connected to PostgreSQL, structured logs flowing to Loki and visible in Grafana, and lint/type-check/unit/e2e tooling wired up. No product features.

## Current State

Docs and plans only. Git on `main`, no remote.

## Desired State

- `docker compose up -d` starts PostgreSQL, Loki, Grafana (with Loki pre-configured as a data source) and Mailpit (local email catcher for Phase 1).
- `npm run dev` starts the app at http://localhost:3000.
- `GET /api/health` returns `200 {"status":"ok","db":"ok"}` when the database is reachable and `503` when it isn't, and logs the check.
- Those logs can be found in Grafana (http://localhost:3001) with the query `{app="venturepath"}`.
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` and `npm run test:e2e` all succeed.

## Verified Environment and Versions (checked 2026-09-25)

- Node 24.5.0, npm 11.2.0, Docker 29.3.1, Docker Compose v5.1.0 on this machine.
- Node requirements: Prisma 7.10.0 needs `^20.19 || ^22.12 || >=24.0`; Next.js 16.3.6 needs `>=20.9.0`. Both are met.
- npm registry: next 16.3.6, prisma 7.10.0 (stable), @prisma/client 7.10.0, @prisma/adapter-pg 7.10.0, better-auth 1.7.6, pino 10.3.1, pino-loki 3.0.0, pino-pretty 13.1.3, zod 4.6.5, vitest 5.0.1, @playwright/test 1.63.0, tailwindcss 4.3.3.
- **Prisma must be pinned to 7.10.0.** npm's `latest` tag for `prisma` points to `8.0.0-rc.17`, and Better Auth 1.7.6 declares a peer range of `prisma ^5 || ^6 || ^7`. Do not run `npx prisma …` before Prisma 7.10.0 is installed locally, or npx may fetch 8.x.
- Prisma 7 facts (Prisma v7 docs): `PrismaClient` requires a driver adapter (`@prisma/adapter-pg` + `pg`); the `prisma-client` generator is used with an explicit `output`; config lives in `prisma7.config.ts` (7.10+) or `prisma.config.ts`; `.env` is not loaded automatically, so the config imports `dotenv/config`.
- pino-loki 3.0.0 (README): runs as a pino worker-thread transport, pushes to `/loki/api/v1/push`, batches every 5 s by default, and drops logs if Loki is unreachable. Requires Node 20+.

## Implementation Sequence

1. **Scaffold Next.js.** Run `create-next-app@16.3.6` with TypeScript, ESLint, Tailwind, App Router, `src/` directory, `@/*` import alias, npm. The repo root is not empty (docs, plans), and `create-next-app` may refuse a non-empty folder. If it does, scaffold into a temporary folder and move the files in without overwriting existing docs or `.gitignore` (merge entries instead). Check the CLI flags with `--help` first.
2. **UI base.** Initialize shadcn/ui (`npx shadcn@latest init`) on top of Tailwind 4. Add no components yet.
3. **Docker Compose** (`docker-compose.yml` plus `docker/` config):
   - `postgres` (current stable major, pinned tag), port 5432, named volume, healthcheck.
   - `loki` (pinned 3.x tag, single-binary local config), port 3100, named volume.
   - `grafana` (pinned tag), host port 3001, Loki data source provisioned from a file.
   - `mailpit`, SMTP 1025 and web UI 8025.
   - Development-only credentials come from `.env` (see `.env.example`); nothing secret is committed.
4. **Environment validation.** `src/lib/env.ts` uses zod to validate server environment variables (`DATABASE_URL`, `LOKI_URL` optional, `LOG_LEVEL`, `NODE_ENV`) and fails fast with a clear message. Add `.env.example`.
5. **Prisma.** Install `prisma@7.10.0` (dev dependency), `@prisma/client@7.10.0`, `@prisma/adapter-pg@7.10.0`, `pg`, `@types/pg`, `dotenv`. Initialize the PostgreSQL datasource with output `src/generated/prisma`. Add `src/generated/` to `.gitignore`. Create `src/lib/db.ts`: a single `PrismaClient` with the `PrismaPg` adapter, reused across hot reloads via `globalThis`. Add scripts `db:generate`, `db:migrate`, `db:studio`. Phase 0 adds no product models; the first migration comes in Phase 1.
6. **Logging.** `src/lib/logger.ts`: a pino logger with base label `app=venturepath` and `env`; `redact` for passwords, tokens, cookies and authorization headers. Output goes to stdout always (pino-pretty in development), plus the `pino-loki` transport when `LOKI_URL` is set. Add `pino`, `pino-loki` and `pino-pretty` to `serverExternalPackages` in `next.config` so the worker-thread transports aren't bundled; confirm this setting against the current Next.js docs during implementation.
7. **Health endpoint.** `src/app/api/health/route.ts` runs `SELECT 1` through Prisma with a short timeout, returns 200 or 503, and logs the result with its duration. It does not expose error details in the response.
8. **Tooling and scripts.** Prettier plus ESLint (from the scaffold). Scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `format`, `test` (Vitest), `test:e2e` (Playwright).
9. **Tests.**
   - Vitest unit test: env validation accepts valid config and rejects a missing `DATABASE_URL`.
   - Vitest integration test: the health handler returns 200 against the Docker Postgres. It is skipped with a clear message if the database is unavailable, and never fakes a pass.
   - Playwright smoke test: the home page renders and `/api/health` returns 200.
10. **README.md.** Prerequisites, first-time setup (`cp .env.example .env`, `docker compose up -d`, `npm install`, `npm run dev`), service URLs and the test commands.

## Verification (Pillar 3)

1. `docker compose up -d`; all containers healthy.
2. `npm run db:generate` succeeds.
3. `npm run lint`, `npm run typecheck`, `npm run build`.
4. `npm test` (unit and integration against Docker Postgres).
5. `npx playwright install chromium`, then `npm run test:e2e`.
6. Call `/api/health`, then query Loki's HTTP API (`/loki/api/v1/query_range` with `{app="venturepath"}`) to confirm the log line arrived.
7. Stop Postgres and confirm `/api/health` returns 503 and logs an error.

## Files Expected to Change

New: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, ESLint/Prettier/PostCSS configs, `components.json`, `src/app/**`, `src/lib/{env,db,logger}.ts`, `prisma/schema.prisma`, `prisma7.config.ts`, `docker-compose.yml`, `docker/**`, `.env.example`, `vitest.config.ts`, `playwright.config.ts`, `tests/**`, `e2e/**`, `README.md`.
Modified: `.gitignore`, `docs/ARCHITECTURE.md`, `docs/PROJECT.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md`, `docs/ROADMAP.md`, `plan/README.md`, this plan's status.

## Documentation Impact

- `docs/DECISIONS.md`: ADR for log shipping (pino-loki direct push, no agent) and for pinning Prisma 7.
- `docs/ARCHITECTURE.md`: actual folder layout and service ports.
- `docs/PROJECT.md`: current state.

## Risks

- **`create-next-app` in a non-empty folder.** Mitigated by the temporary-folder fallback.
- **Accidental Prisma 8 install.** Mitigated by exact pins and no global `npx prisma` before install.
- **pino worker threads under Next.js bundling.** Mitigated by `serverExternalPackages` and verified with a real log reaching Loki.
- **Windows specifics** (line endings, Docker volume paths). Add `.gitattributes` if line-ending noise appears.
- **Dropped logs if Loki is down.** Acceptable in development; logs still go to stdout.

## Rollback

All work lands in one commit; revert that commit to undo it. `docker compose down -v` removes local containers and volumes (this deletes local development data only).

## Ship

When verification passes: update docs, mark this plan `shipped`, and commit `feat: project foundation (Next.js, Postgres, Loki, tooling)`.

## Outcome (2026-09-25)

Deviations from the plan:
- `create-next-app` now adds its own `AGENTS.md` and `CLAUDE.md`. Scaffolded in a temp folder; our files were kept, and the Next.js agent-rules block (which `next dev` re-adds anyway) was appended to `AGENTS.md`.
- `@types/node` raised from ^20 to ^24; Vitest 5 requires ^22 or >=24.
- npm overrides added for `mysql2` and `deepmerge-ts` (ADR-010).
- The Loki healthcheck was removed; the image has no shell.
- Review finding fixed: Compose ports were bound to all interfaces, exposing development credentials to the local network. They now bind to 127.0.0.1.
- Vitest config is `vitest.config.mts`, because an ESM `.ts` config triggered a warning in this CommonJS package.
- Prettier configured with `printWidth` 100 and LF line endings; markdown excluded.

Verification actually run:
- `docker compose up -d`: Postgres and Mailpit healthy; Loki `/ready` reachable; Grafana's Loki data source health is "OK".
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check`: pass.
- `npm test`: 2 files, 6 tests pass (unit, plus integration against Docker Postgres).
- `npm run test:e2e`: 2 tests pass (home page, `/api/health`).
- Manual: `/api/health` → 200. The log line appeared in Loki under `{app="venturepath"}` with labels `app`, `env`, `level`.
- Manual: Postgres stopped → `/api/health` returned 503 in about 100 ms, and an error log reached Loki with `level=error`. Neither the dev log nor Loki contained the connection string or password. After Postgres restarted, `/api/health` returned 200 without an app restart.
- `npm audit`: 0 vulnerabilities.

Not verified:
- Production build served with `npm start` (only `next build` was run).
- Behavior on macOS/Linux.
