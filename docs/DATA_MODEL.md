# Data Model

Source of truth: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.

## Implemented (Phase 1)

Auth tables follow Better Auth's core schema (generated with `npx auth@1.7.6 generate`). Table names are lowercase (`@@map`).

| Model | Table | Notes |
|-------|-------|-------|
| `User` | `user` | `email` unique, `emailVerified`, `role` (`Role?`). |
| `Session` | `session` | `token` unique; cascades on user delete. |
| `Account` | `account` | One per sign-in method. Email/password uses `providerId = "credential"` with the password hash; Google uses `providerId = "google"`. Cascades on user delete. |
| `Verification` | `verification` | Email verification tokens. |

`Role` enum: `student`, `msme`, `admin`.

Role rules:
- `role` is `null` until chosen. A user without a role can only reach `/onboarding/role`.
- Only `assignInitialRole` (`src/lib/user-roles.ts`) writes it from user input: `student` or `msme` only, and only while it is `null`.
- `admin` is only created by `npm run db:seed`.

## Implemented (Phase 2)

| Model | Table | Notes |
|-------|-------|-------|
| `StudentProfile` | `student_profile` | `userId` unique (1–1 with `User`, cascade delete). `institution`, `course`, `graduationYear`, `skills String[]` (lowercase, max 20), `bio?`, `links String[]` (http/https, max 5). The student's name is `User.name`. |
| `MsmeProfile` | `msme_profile` | `userId` unique (1–1, cascade delete). `businessName`, `description`, `industry`, `location`, `website?` (http/https), `status MsmeStatus` (default `pending`, indexed). |

`MsmeStatus` enum: `pending`, `approved`, `rejected`.

Profile rules (ADR-016):
- Profiles are optional; writes go through `src/lib/profiles.ts` with the `userId` from the session.
- `status` is never read from input. Creating a profile sets `pending`. Saving a changed `approved` profile sets `pending`; saving a `rejected` profile sets `pending` (resubmission); an unchanged `approved` save stays `approved`.
- The status update is conditional on the status that was read, so it can't overwrite a concurrent review decision.

## Implemented (Phase 3)

`MsmeProfile` review fields, describing the last admin decision:

| Field | Notes |
|-------|-------|
| `reviewedById` | FK to `User` (the admin), `onDelete: SetNull`. |
| `reviewedAt` | Time of the last decision. |
| `rejectionReason` | Required when rejecting (max 500), cleared on approval. |

Review rules (ADR-019):
- Only `reviewMsme` (`src/lib/msme-review.ts`) writes them, from an admin session, for any status (approve, reject, revoke).
- The update is conditional on `updatedAt` equal to what the admin saw and on the status actually changing, so edits made after the page loaded or repeated submits are refused.
- An MSME edit that resets the status to `pending` keeps the last review fields as history.

## Implemented (Phase 4)

`Opportunity` (`opportunity`): `msmeProfileId` (MsmeProfile 1–N, cascade delete), `type` (`freelance` | `internship`), `title`, `description`, `skills String[]` (max 15), `workMode` (`remote` | `onsite` | `hybrid`), `city?` (required unless remote), `payType` (`paid` | `unpaid`), `payAmount Int?` and `payPeriod?` (`fixed` | `month` | `hour`, both set only when paid), `duration?`, `deadline Date?` (last day to apply, India time), `status` (`draft` | `published` | `closed`), `publishedAt?`, `closedAt?`. Indexed on `msmeProfileId` and `status`.

Rules (ADR-020):
- Unpaid only for internships.
- Create, edit, publish and reopen need an approved MSME; close and delete-draft are always allowed. Only drafts can be deleted.
- Transitions: draft → published → closed → published (reopen). Publish/reopen refused when the deadline has passed. Status updates are conditional on the expected current status.
- All writes are scoped to the session user's own MSME profile (`src/lib/opportunities.ts`).
- Visibility rule for Phase 5: students see a listing only if it is `published`, its MSME is `approved`, and its deadline hasn't passed.

## Planned (Phases 5–6)

- Application. See `plan/2026-09-25-mvp-initial-plan.md`.
- StudentProfile N–N Opportunity via Application.
