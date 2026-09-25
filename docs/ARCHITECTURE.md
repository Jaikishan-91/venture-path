# Architecture

Status: Target architecture only — nothing is implemented yet. Update as components are built.

System Overview:
A TypeScript Next.js (App Router) web application backed by PostgreSQL through Prisma, with structured pino logs shipped to Grafana Loki. Local development runs everything in Docker Compose.

Components:
- **Web app (Next.js App Router)** — UI (Tailwind + shadcn/ui) and server logic (server actions / route handlers).
- **Auth (Better Auth)** — email/password with email verification, Google sign-in, roles: student, msme, admin.
- **Database (PostgreSQL + Prisma)** — system of record; schema changes via Prisma Migrate.
- **Logging (pino → Loki → Grafana)** — structured JSON logs; exact shipping mechanism decided in the scaffolding plan.
- **Local dev services (Docker Compose)** — Postgres, Loki, Grafana, and a local mail catcher for verification emails.

Data Flow:
User (browser) → Next.js (UI + server logic) → Prisma → PostgreSQL
Next.js → pino structured logs → Loki → Grafana

Open architecture decisions (record in `docs/DECISIONS.md` when made):
- Production hosting / deployment target (local development uses Docker Compose — ADR-008).
- Log shipping approach to Loki.
- Production email provider.
- File storage (e.g. resumes, logos), if needed.
