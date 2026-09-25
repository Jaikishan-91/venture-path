# Implementation Plan — Phase 2: Profiles

Status: shipped (2026-09-25)
Date: 2026-09-25
Parent plan: `plan/2026-09-25-mvp-initial-plan.md`

## Objective

Students and MSMEs can create and edit their own profile. An MSME profile carries an approval status (`pending`, `approved`, `rejected`) that Phase 3's admin review will act on.

## Current State

Phase 1 shipped: users with roles, `/student` and `/msme` placeholder dashboards protected by `requireRole`. No profile tables.

## Decisions (user, 2026-09-25)

1. Profiles are optional. Dashboards work without one and show a "complete your profile" prompt. Later phases require a profile where it matters (MSME before approval/posting, student before applying).
2. When an approved MSME changes its profile, its status goes back to `pending` and needs admin approval again.
3. A rejected MSME can edit its profile; saving resubmits it (status back to `pending`).
4. Student skills are free-form tags.
5. Fields follow the MVP draft data model.

## Design

- **Models** (new migration `profiles`):
  - `StudentProfile` (`student_profile`): `id`, `userId` (unique, cascade), `institution`, `course`, `graduationYear`, `skills String[]`, `bio?`, `links String[]`, timestamps.
  - `MsmeProfile` (`msme_profile`): `id`, `userId` (unique, cascade), `businessName`, `description`, `industry`, `location`, `website?`, `status MsmeStatus @default(pending)`, timestamps.
  - Enum `MsmeStatus`: `pending`, `approved`, `rejected`.
- **Name:** the student's name is `User.name` (from sign-up or Google), not duplicated on the profile.
- **Deferred to Phase 3:** `reviewedBy`, `reviewedAt`, rejection reason. Phase 3 owns the review actions and adds those columns.
- **Validation** (`src/lib/profile-schemas.ts`, zod, pure): trimmed strings with max lengths; graduation year 1950 to current year + 8; skills from a comma-separated input, lowercased, de-duplicated, at most 20 of 1–40 characters; links one per line, at most 5, `http`/`https` only (blocks `javascript:` URLs); website `http`/`https` only.
- **Status rule** (pure function `nextMsmeStatus(current, changed)`): no profile yet gives `pending`; `approved` stays `approved` only if nothing changed, otherwise `pending`; `rejected` gives `pending` on any save; `pending` stays `pending`.
- **Writes** (`src/lib/profiles.ts`): `saveStudentProfile(userId, input)` upserts by `userId`. `saveMsmeProfile(userId, input)` reads the current row, compares fields and writes the new status in one transaction. `userId` always comes from the session, never from the form, so users can only write their own profile. Status is never read from the form.
- **Pages:** `/student/profile` and `/msme/profile` (form pre-filled with the current profile; `requireRole`). Server actions validate, save, log, then redirect to the dashboard. Dashboards show the profile summary or the prompt; the MSME dashboard shows the status with a short explanation.
- **UI:** reuse `Card`, `Input`, `Label`, `Button`; add shadcn `Textarea`.
- **Logging:** `userId`, profile kind, and MSME status transitions. No profile contents.

## Blast Surface

New: `src/lib/profile-schemas.ts`, `src/lib/profiles.ts`, `src/app/student/profile/{page,actions,student-profile-form}.tsx|ts`, `src/app/msme/profile/{page,actions,msme-profile-form}.tsx|ts`, `src/components/ui/textarea.tsx`, migration, `tests/profile-schemas.test.ts`, `tests/profiles.test.ts`, `e2e/profiles.spec.ts`.
Modified: `prisma/schema.prisma`, `src/app/student/page.tsx`, `src/app/msme/page.tsx`, `e2e/auth.spec.ts` only if dashboard text assertions break, `e2e/helpers.ts` (shared sign-up helper, set MSME status), docs.
Read but unchanged: `src/lib/authz.ts`, `src/lib/db.ts`, `src/proxy.ts` (matcher already covers `/student/*` and `/msme/*`).

## Implementation Sequence

1. Schema and migration; regenerate client.
2. Schemas and status rule; unit tests.
3. Data functions; integration tests.
4. Textarea component, pages, actions, dashboards.
5. E2E tests; lint, typecheck, format, build.
6. Review, docs, commit.

## Test Strategy

- Unit: validation (limits, skill normalisation, link protocol, year range) and every `nextMsmeStatus` case.
- Integration (Docker Postgres): create and update student profile; MSME first save is `pending`; approved plus change gives `pending`; approved plus identical save stays `approved`; rejected plus save gives `pending`; deleting the user cascades.
- E2E: student completes and edits a profile, dashboard shows it; MSME creates a profile and sees "pending"; MSME approved (set in DB) edits and is back to pending; a student can't open `/msme/profile`.

## Documentation Impact

`docs/DATA_MODEL.md`, `docs/API.md`, `docs/DECISIONS.md` (ADR-016), `docs/CHANGELOG.md`, `docs/ROADMAP.md`, `plan/README.md`, this plan's outcome.

## Risks

- Editing another user's profile: prevented by taking `userId` only from the session; covered by tests.
- Status bypass (an MSME setting itself `approved`): status is never read from input; covered by tests.
- Race between an MSME edit and a future admin approval: the MSME save reads and writes in one transaction; Phase 3 must also update conditionally.

## Rollback

One commit. Revert it and run `prisma migrate reset` locally (local dev data only).

## Outcome (2026-09-25)

Deviations from the plan:
- The MSME save doesn't use a database transaction. It reads the profile, then updates only if the status is still the one it read (`updateMany where { userId, status }`). If the status changed in between, the user is asked to save again. Under Postgres' default isolation this protects against a concurrent review decision better than a read-then-write transaction would.
- `e2e/auth.spec.ts` changed only to import the shared `signUp` helper.

Verification actually run:
- `npx prisma migrate dev --name profiles` applied; `npm run db:generate` ok.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`: pass.
- `npm test`: 6 files, 53 tests pass (35 new: validation limits, skill normalisation, link and website protocol checks, every status-rule case; integration: student upsert, cascade delete, MSME pending on create, approved kept when unchanged, approved to pending on change, rejected resubmission, per-user isolation).
- `npm run test:e2e`: 16 tests pass (5 new: student create with a rejected `javascript:` link and values kept after the error, then edit; MSME create, then approved (set in the database), then edit back to pending; rejected MSME resubmits; student blocked from `/msme/profile`; signed-out users redirected). The dev server had to be restarted after the migration because it held the old Prisma client.
- Loki: profile logs contain user IDs and status transitions only. E2E users removed afterwards (only the seeded admin remains).

Not verified:
- The conflict path (status changing between the read and the update) has no automated test; it needs a concurrent writer, which arrives with Phase 3.
- Two simultaneous first saves by the same MSME: the second hits the unique `userId` constraint and gets the generic error message.
