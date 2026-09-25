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

Sign up at `/sign-up`; the verification email lands in Mailpit (http://localhost:8025). Google sign-in appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

## Local services

| Service    | URL                          | Notes                                   |
| ---------- | ---------------------------- | --------------------------------------- |
| App        | http://localhost:3000        | `npm run dev`                           |
| Grafana    | http://localhost:3001        | admin / admin; Loki is pre-configured   |
| Loki       | http://localhost:3100        | Readiness: `/ready`                     |
| PostgreSQL | localhost:5432               | Credentials from `.env`                 |
| Mailpit    | http://localhost:8025        | Catches outgoing email (SMTP on 1025)   |

All service ports bind to `127.0.0.1` only.

To see app logs, open Grafana → Explore → Loki and run `{app="venturepath"}`.

## Scripts

| Command                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Start the dev server                          |
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
