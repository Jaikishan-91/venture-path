# Implementation Plan — Rename roles; separate sign-in and sign-up per role

Status: shipped

## User decisions (2026-09-26)

- Rename MSME → **organisation** and student → **user** everywhere, including code identifiers, routes, Prisma models, enums, tables and columns.
- Separate sign-in and sign-up pages for users and organisations; the admin gets a sign-in page only (admins still come from `npm run db:seed`, ADR-013).
- Each sign-in page accepts only its own role; a wrong-role account is refused and pointed to its page.

## Current state

Roles `student` / `msme` / `admin` (`Role` enum). Models `StudentProfile` (`student_profile`), `MsmeProfile` (`msme_profile`), enum `MsmeStatus`, columns `opportunity.msmeProfileId`, `application.studentProfileId`. Routes `/student/*`, `/msme/*`, `/admin/msmes`. One `/sign-in` and one `/sign-up` (role radio). Google sign-in lands on `/dashboard`; new Google users choose a role at `/onboarding/role`. About 720 references in about 70 files.

## Desired state

Naming:

| Old | New |
|-----|-----|
| Role `student`, `msme` | `user`, `organisation` |
| `StudentProfile` / `student_profile` | `UserProfile` / `user_profile` |
| `MsmeProfile` / `msme_profile` | `OrganisationProfile` / `organisation_profile` |
| `MsmeStatus` | `OrganisationStatus` |
| `User.studentProfile`, `User.msmeProfile`, `User.msmeReviews` | `userProfile`, `organisationProfile`, `organisationReviews` |
| `opportunity.msmeProfileId`, `application.studentProfileId` | `organisationProfileId`, `userProfileId` |
| `/student/*`, `/msme/*`, `/admin/msmes` | `/user/*`, `/organisation/*`, `/admin/organisations` (old paths permanently redirect) |
| UI text "student(s)", "MSME(s)" | "user(s)", "organisation(s)" |

Auth pages:

| Page | Role | Notes |
|------|------|-------|
| `/sign-in`, `/sign-up` | user | No role radio. |
| `/organisation/sign-in`, `/organisation/sign-up` | organisation | |
| `/admin/sign-in` | admin | Email and password only; no sign-up, no Google. |

- Password sign-in goes through a server action that verifies the password first, then refuses a mismatched role by deleting the new session. A wrong password gives the same "Invalid email or password" message as before, so the page never reveals an account's role without the right password.
- Google goes through `GET /auth/continue?as=<role>`: a user without a role gets the page's role (user or organisation), and a mismatched role is signed out and sent back with an explanation.
- `src/proxy.ts` lets the `sign-in`/`sign-up` pages under `/organisation` and `/admin` through, and sends signed-out visitors to the sign-in page for that area.

## Blast surface

- Data: new migration using `ALTER TYPE … RENAME VALUE`, `ALTER TYPE/TABLE … RENAME`, `RENAME COLUMN`, and constraint and index renames, so data is preserved. Check with `prisma migrate diff` from the live DB to the schema: it must be empty. Past migrations are not edited.
- Raw SQL in `src/lib/search.ts` and `scripts/`.
- Every file in `src/app/student`, `src/app/msme`, `src/app/admin/msmes`, plus `src/lib/{roles,user-roles,profiles,profile-schemas,msme-review,opportunities,applications,search,resume-analysis}.ts`, components, `src/proxy.ts`, `next.config.ts` (redirects), email text, `prisma/seed.ts`.
- Tests: `tests/*`, `e2e/*` (labels, routes, role values).
- Docs: living docs (`PROJECT`, `REQUIREMENTS`, `ARCHITECTURE`, `DATA_MODEL`, `API`, `ROADMAP`, `README`), new ADR-025 (rename) and ADR-026 (role-specific auth). The changelog and old plans stay as history.

## Sequence

1. Schema and hand-written rename migration; apply; confirm there is no drift.
2. Scripted identifier and text rename across `src`, `tests`, `e2e`, `prisma/seed.ts`, `scripts`; move route folders and files; fix collisions by hand (e.g. `student`/`user` variables next to `session.user`).
3. Role-specific auth: actions, pages, the `/auth/continue` route, proxy, redirects.
4. Tests: unit tests for role rules and redirects; integration tests for the sign-in role check; update the e2e auth specs (per-role pages, wrong-role refusal, admin sign-in).
5. Typecheck, lint, vitest, build, Playwright; docs; Docker build.

## Risks

- `user` as a role name next to the `User` model and `session.user`; renamed variables need careful review.
- Existing sessions and data survive (value renames are in place); bookmarked URLs and old email links are covered by redirects.
- Rollback: a reverse migration (the same renames reversed) plus reverting the commit.
