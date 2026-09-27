# VenturePath

A marketplace where organisations post freelance work and internships, and users find and apply for them.

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

### Google Calendar and Meet (optional)

Scheduled interviews get a Google Calendar invite and a Meet link from one platform Google account (a dedicated Gmail account is fine). Without it, scheduling still works and emails are sent without Meet links.

1. In the Google Cloud project of the OAuth client, enable the Google Calendar API.
2. On the OAuth consent screen, add the scope `https://www.googleapis.com/auth/calendar.events`. Either add the platform account as a test user (refresh tokens then expire after 7 days) or publish the app "In production" (recommended; unverified is fine, Google shows a one-time warning).
3. Add `http://localhost:53682/oauth2callback` to the client's Authorized redirect URIs.
4. Run `npm run google:calendar-token`, sign in as the platform account, and put the printed token in `.env` as `GOOGLE_CALENDAR_REFRESH_TOKEN`.

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

### Docker: live development

Runs the app in a container that picks up code changes without rebuilding:

```bash
npm run docker:dev    # = docker compose --profile dev up --build --watch next-dev
```

Compose watches the files on your machine and copies changes into the container, where `next dev` hot-reloads them (Compose "watch" mode; see `docs/DECISIONS.md` ADR-028).

| You change | What happens |
| --- | --- |
| `src/**` | Synced; hot-reloaded in the browser |
| `prisma/**`, `prisma7.config.ts` | Synced; nodemon regenerates the Prisma client and restarts `next dev`. Apply new migrations with `npm run db:migrate` on the host. |
| `next.config.ts`, `nodemon.json` | Synced; the container restarts |
| `package.json`, `package-lock.json` | The image is rebuilt (fresh `npm ci`) |
| `.env` | Not watched (secrets stay out of the image). Recreate the container: stop `docker:dev` and run it again. |

The container uses your `.env`, except that it reaches Postgres, Loki and Mailpit by their service names. Email goes out through the SMTP server in `.env` exactly as with `npm run dev`. The container reuses the embedding model in `.cache/models` on your machine (downloaded by the first `npm run dev` or `npm test`), so it needs no download. Stop with Ctrl+C.

### Docker: production image

```bash
npm run docker:prod   # = docker compose --profile prod up -d --build next
docker compose run --rm next npx prisma migrate deploy   # once, and after new migrations
docker compose run --rm next npm run db:seed
```

The app builds as a standalone Next.js server; code changes need a rebuild. The `hf-cache` volume keeps the HuggingFace model between restarts. `docker:dev` and `docker:prod` both use port 3000, so run one at a time. Plain `docker compose up -d` starts only Postgres, Loki, Grafana and Mailpit.

## Scripts

| Command                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Start the dev server with live reload         |
| `npm run dev:next`     | Start `next dev` without nodemon              |
| `npm run email:test -- you@gmail.com` | Send a test email with the current SMTP settings |
| `npm run embeddings:backfill` | Embed listings that have no embedding yet |
| `npm run google:calendar-token` | Get the Google Calendar refresh token for interview invites |
| `npm run build`        | Production build                              |
| `npm run lint`         | ESLint                                        |
| `npm run typecheck`    | Generate route types and run `tsc --noEmit`   |
| `npm run format`       | Format with Prettier                          |
| `npm test`             | Vitest unit and integration tests (needs Docker Postgres) |
| `npm run test:e2e`     | Playwright end-to-end tests (needs Docker services and the seeded admin; run `npx playwright install chromium` once) |
| `npm run db:migrate`   | Create and apply a Prisma migration           |
| `npm run db:seed`      | Create the admin account (safe to re-run)     |
| `npm run db:studio`    | Open Prisma Studio                            |
| `npm run docker:dev`   | Run the app in Docker with live code sync     |
| `npm run docker:prod`  | Build and run the production image            |

## Notes

- Prisma is pinned to 7.10.0. Don't upgrade to Prisma 8 until Better Auth supports it (see `docs/DECISIONS.md`).
- `docker compose down -v` deletes all local database, log and dashboard data.
