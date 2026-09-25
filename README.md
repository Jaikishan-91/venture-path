# VenturePath

A marketplace where MSMEs post freelance work and internships, and students find and apply for them.

Project docs live in `docs/`; plans live in `plan/`.

## Prerequisites

- Node.js 24 (tested with 24.5.0) and npm
- Docker with Docker Compose

## First-time setup

```bash
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
# In .env set BETTER_AUTH_SECRET (command in the file) and ADMIN_PASSWORD (12+ characters).
docker compose up -d        # Postgres, Loki, Grafana, Mailpit
npm install                 # also generates the Prisma client
npx prisma migrate dev      # create the database tables
npm run db:seed             # create the admin account from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev
```

Open http://localhost:3000. `GET /api/health` returns `{"status":"ok","db":"ok"}` when the database is reachable.

### Email

By default all email goes to Mailpit (http://localhost:8025). To send real email through Gmail, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` (your Gmail address) and `SMTP_PASSWORD` (a [Google App Password](https://myaccount.google.com/apppasswords); needs 2-Step Verification) in `.env`, then check with `npm run email:test -- you@gmail.com`. Outside production, addresses on `.local`, `.test`, `.example` and `.invalid` domains (used by the tests and the seeded admin) still go to Mailpit.

### Live reload

- Changes in `src/` (pages, components, server actions, API routes, `lib/`) are hot-reloaded by Next.js; the browser updates without a restart.
- Changes to `prisma/schema.prisma`, `prisma7.config.ts` or `.env` make nodemon regenerate the Prisma client and restart the dev server (`nodemon.json`). Apply schema changes to the database with `npx prisma migrate dev` as usual.
- Type `rs` and Enter in the dev server terminal to force a restart.

Sign up at `/sign-up`; the verification email lands in Mailpit (http://localhost:8025). Google sign-in appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

## Local services

| Service    | URL                          | Notes                                   |
| ---------- | ---------------------------- | --------------------------------------- |
| App        | http://localhost:3000        | `npm run dev`                           |
| Grafana    | http://localhost:3001        | admin / admin; Loki is pre-configured   |
| Loki       | http://localhost:3100        | Readiness: `/ready`                     |
| PostgreSQL | localhost:5432               | pgvector image; credentials from `.env` |
| Mailpit    | http://localhost:8025        | Catches outgoing email (SMTP on 1025)   |

All service ports bind to `127.0.0.1` only.

To see app logs, open Grafana → Explore → Loki and run `{app="venturepath"}`.

### Full Docker setup

For a fully containerized setup (no local Node.js needed):

```bash
cp .env.example .env
docker compose up -d --build
```

The app builds as a standalone Next.js server. The `hf-cache` volume persists the HuggingFace model between container restarts. Database migrations must still be applied once:

```bash
docker compose run --rm next npx prisma migrate deploy
docker compose run --rm next npm run db:seed
```

For active development, prefer the `npm run dev` workflow above — it provides hot reload without rebuilding the image.

## Scripts

| Command                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Start the dev server with live reload         |
| `npm run dev:next`     | Start `next dev` without nodemon              |
| `npm run email:test -- you@gmail.com` | Send a test email with the current SMTP settings |
| `npm run embeddings:backfill` | Embed listings that have no embedding yet |
| `npm run build`        | Production build                              |
| `npm run lint`         | ESLint                                        |
| `npm run typecheck`    | Generate route types and run `tsc --noEmit`   |
| `npm run format`       | Format with Prettier                          |
| `npm test`             | Vitest unit and integration tests (needs Docker Postgres) |
| `npm run test:e2e`     | Playwright end-to-end tests (needs Docker services and the seeded admin; run `npx playwright install chromium` once) |
| `npm run db:migrate`   | Create and apply a Prisma migration           |
| `npm run db:seed`      | Create the admin account (safe to re-run)     |
| `npm run db:studio`    | Open Prisma Studio                            |

## Notes

- Prisma is pinned to 7.10.0. Don't upgrade to Prisma 8 until Better Auth supports it (see `docs/DECISIONS.md`).
- `docker compose down -v` deletes all local database, log and dashboard data.
