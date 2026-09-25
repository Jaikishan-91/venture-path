# Project

Name: VenturePath

Purpose: A two-sided marketplace that connects students with MSMEs (Micro, Small and Medium Enterprises) so that MSMEs can post freelance work and internships, and students can discover and apply for them.

Core Functionality:
- Student and MSME accounts/profiles.
- MSMEs post freelance gigs and internships.
- Students browse, search and apply for opportunities.
- Two-way connection between students and MSMEs.
- Detailed scope is being defined — see `docs/REQUIREMENTS.md` and `plan/`.

Technology Stack:
- Language: TypeScript. Package manager: npm.
- Application framework: Next.js (App Router).
- Database: PostgreSQL via Prisma ORM.
- Auth: Better Auth (email/password + Google).
- UI: Tailwind CSS + shadcn/ui.
- Logging: pino → Grafana Loki, viewed in Grafana.
- Testing: Vitest (unit/integration), Playwright (end-to-end).
- Local environment: Docker Compose. Production hosting: not yet decided.
- Version control: Git (local repository; remote not yet configured).
- See `docs/DECISIONS.md` ADR-001 to ADR-012.

Current State: Phase 0 (foundation) shipped on 2026-09-25: Next.js app, Docker Compose services, Prisma connection, logging to Loki, and test tooling. No product features yet. Next: Phase 1 (authentication). See `README.md` for local setup.
