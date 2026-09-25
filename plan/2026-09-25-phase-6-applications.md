# Implementation Plan — Phase 6: Applications

Status: shipped (2026-09-25)
Parent plan: `plan/2026-09-25-mvp-initial-plan.md`

## Objective

Students apply to a listing with a resume and an optional note. MSMEs accept or reject. Students track status. Both email addresses are revealed only after acceptance.

## Decisions (user, 2026-09-25)

1. On acceptance, each side sees the other's sign-in email.
2. A resume file is required (PDF, DOC or DOCX, max 5 MB). No other file storage.
3. The note is optional, up to 1000 characters.
4. A student can withdraw while the application is waiting, and can apply again after that.
5. Email the MSME on a new application, and the student on accept or reject.

## Design

One `Application` row per student per listing. Withdrawal keeps the row; applying again updates it back to `submitted` and replaces the file. Resumes live in `uploads/resumes` (git-ignored) under a generated key and are served by an authenticated route.

## Outcome (2026-09-25)

Verification actually run:
- `npx prisma migrate dev --name applications` applied.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`: pass.
- `npm test`: 14 files, 138 tests pass. New: resume validation; apply once, withdraw, reapply; closed listing and missing profile refused; resume readable only by the student and owning MSME; only that MSME can accept; an accepted application cannot be withdrawn.
- `npm run test:e2e`: 25 tests pass, including a student applying with a PDF, the MSME accepting, both sides seeing the contact email, and both decision emails in Mailpit.

Not verified: a DOC/DOCX upload through the browser (the type check is unit-tested). Deleting a user leaves the resume file on disk.
