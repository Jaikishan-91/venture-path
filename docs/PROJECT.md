# Project

Name: VenturePath

Purpose: A two-sided marketplace that connects users with organisations (MSMEs: Micro, Small and Medium Enterprises; called "organisations" in the product since 2026-09-26, ADR-025) so that organisations can post freelance work and internships, and users can discover and apply for them.

Core Functionality:
- User and organisation accounts/profiles.
- Organisations post freelance gigs and internships.
- Users browse, search and apply for opportunities.
- Two-way connection between users and organisations.
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
- See `docs/DECISIONS.md` ADR-001 to ADR-015.

Current State (2026-09-26): MVP phases 0–6 shipped (auth, profiles, admin approval of organisations, listings, public browse with semantic search, applications with resumes and emails), plus Phase 7: optional AI resume analysis with admin-editable prompts, and a careers-portal UI. Runs locally with Docker Compose; see `README.md`. Production hosting is not decided.
