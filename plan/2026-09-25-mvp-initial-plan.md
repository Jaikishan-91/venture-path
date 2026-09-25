# Implementation Plan — VenturePath MVP (initial)

Status: draft
Date: 2026-09-25
Decisions this plan relies on: ADR-001 to ADR-009 in `docs/DECISIONS.md`.

## Objective

Build the MVP of VenturePath: MSMEs post freelance work and internships, students find and apply, MSMEs accept or reject. Contact after acceptance happens off-platform.

## Current State

Greenfield. Documentation and agent operating rules only. No application code, no database, no logging. Git initialized locally on `main` (no remote).

## Desired State

A locally runnable app (`docker compose up` plus `npm run dev`) where:
1. Users sign up as a student or an MSME with email/password or Google, and verify their email.
2. Students and MSMEs complete a profile.
3. An admin approves or rejects MSMEs.
4. Approved MSMEs create, edit, publish and close opportunities (freelance or internship).
5. Students browse and filter published opportunities from approved MSMEs.
6. Students apply; MSMEs review applicants and accept or reject; students see their application status.
7. Every server action produces structured logs visible in Grafana through Loki.

## Out of Scope (MVP)

In-app messaging, contracts/milestones, payments, reviews/ratings, student service listings, student directory, production deployment.

## Delivery Phases

Each phase is a shippable feature. It gets its own detailed plan file in `plan/` before implementation, and a Git commit when it ships.

| # | Feature | Summary |
|---|---------|---------|
| 0 | Foundation | Next.js + TypeScript app, Docker Compose (Postgres, Loki, Grafana, mail catcher), Prisma setup, pino logging to Loki, env validation, lint/format, Vitest + Playwright wired up, health check. |
| 1 | Authentication | Better Auth with Prisma adapter; email/password with email verification; Google sign-in; role chosen at signup (student or msme); admin created by a seed script; route protection by role. |
| 2 | Profiles | Student profile and MSME profile; MSME approval status (`pending`, `approved`, `rejected`). |
| 3 | Admin approval | Admin page listing pending MSMEs; approve or reject with an optional reason. |
| 4 | Opportunities | Approved MSMEs create, edit, publish and close freelance and internship listings. |
| 5 | Browse and search | Students list and filter published opportunities (type, keyword, location/remote, skills). |
| 6 | Applications | Students apply with a short note; MSMEs view applicants and accept/reject; students track status. |

## Draft Data Model

To be finalized in the Phase 1–2 plans. Better Auth also requires its own tables (user, session, account, verification), which will be generated from its Prisma adapter.

- **User** — auth user; `role`: `student` | `msme` | `admin`.
- **StudentProfile** — userId, name, institution, course, graduation year, skills, bio, links.
- **MsmeProfile** — userId, business name, description, industry, location, website, `status` (`pending` | `approved` | `rejected`), reviewedBy, reviewedAt, rejection reason.
- **Opportunity** — msmeProfileId, `type` (`freelance` | `internship`), title, description, skills, location, remote flag, compensation (fields TBD), duration, deadline, `status` (`draft` | `published` | `closed`).
- **Application** — opportunityId, studentProfileId, note, `status` (`submitted` | `accepted` | `rejected` | `withdrawn`), timestamps. Unique on (opportunityId, studentProfileId).

Visibility rule: an Opportunity is visible to students only when its status is `published` and its MSME's status is `approved`. Enforced on the server, not just in the UI.

## Blast Surface

Everything is new. Expected top-level additions:
- `package.json`, `tsconfig.json`, Next.js config, lint/format config.
- `src/app/` (routes), `src/lib/` (db client, auth, logger, env), `src/components/`.
- `prisma/schema.prisma`, `prisma/migrations/`, seed script.
- `docker-compose.yml` plus Loki/Grafana config.
- `.env.example` (no real secrets committed).
- `tests/` (Vitest) and `e2e/` (Playwright).
- Docs: `docs/DATA_MODEL.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md` updated per phase.

## Test Strategy

- Unit tests (Vitest) for validation and access-control helpers.
- Integration tests (Vitest against the Docker Postgres) for data rules: visibility rule, one application per student per opportunity, role checks.
- End-to-end tests (Playwright) for the core flow: MSME signs up → admin approves → MSME posts → student applies → MSME accepts → student sees accepted.
- Each phase runs lint, type-check, build and its tests before it ships.

## Risks

- **Authorization bugs** (a student editing listings, an unapproved MSME's listings leaking). Mitigation: central server-side role and ownership checks, with tests for each rule.
- **Personal data in logs.** Mitigation: never log passwords, tokens or full request bodies; redact emails where not needed.
- **Email delivery.** Local development uses a mail catcher; the production provider is undecided.
- **Google OAuth** needs a Google Cloud OAuth client created by the product owner.
- **Library behavior** (Better Auth + Prisma adapter, pino → Loki transport) must be checked against current documentation during Phase 0–1, not assumed.

## Rollback / Recovery

Each phase is a separate commit, so any phase can be reverted. Database changes go through Prisma migrations; no production data exists yet.

## Open Questions (to resolve before or during the relevant phase)

1. Phase 6: when an MSME accepts, which contact details are revealed to each side (email, phone)?
2. Phase 6: do students attach a resume file? If so, file storage is needed.
3. Phase 4: what compensation fields are needed (stipend amount, fixed price, unpaid allowed)?
4. Phase 5: which locations/cities matter, or is remote the default?
5. B-001: what is `/graphify`?

## Next Step

Approve this plan, then write `plan/2026-09-25-phase-0-foundation.md` and start Phase 0.
