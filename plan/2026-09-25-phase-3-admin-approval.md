# Implementation Plan â€” Phase 3: Admin approval of MSMEs

Status: shipped (2026-09-25)
Date: 2026-09-25
Parent plan: `plan/2026-09-25-mvp-initial-plan.md`

## Objective

An admin reviews MSME profiles and approves or rejects them. The MSME sees the decision on its dashboard and gets an email.

## Current State

Phase 2: `MsmeProfile.status` exists (`pending` on create, back to `pending` on edit after approval or rejection, ADR-016). Nobody can change it through the app. `/admin` is a placeholder. Real email works (ADR-018).

## Decisions (user, 2026-09-25)

1. Email the MSME on approve and on reject (with the reason).
2. An admin can approve or reject from any status (revoke an approval, approve a rejected MSME).
3. The admin page lists all MSMEs with a status filter, Pending by default.
4. A rejection reason is required.

## Design

- **Schema** (migration `msme_review`): `MsmeProfile.reviewedById String?` (FK to `User`, `onDelete: SetNull`), `reviewedAt DateTime?`, `rejectionReason String?`. They describe the last decision; an MSME edit that resets the status to `pending` leaves them as history.
- **Review** (`src/lib/msme-review.ts`): `reviewMsme(adminId, input)` with zod input `{ profileId, decision: approve|reject, reason, profileUpdatedAt }`. Reason required (1â€“500) for reject, cleared on approve. The update is conditional on `updatedAt` matching the value the admin saw, so an MSME edit made after the page loaded (or a second admin's decision) makes it fail with a "changed, review again" message instead of approving unseen content. `adminId` comes from the session.
- **Email:** after a successful update, sent without awaiting (logged on success or failure), to the MSME user's email: approved, or not approved with the reason and a link to edit the profile.
- **Pages:** `/admin` shows pending count and links to `/admin/msmes`. `/admin/msmes?status=pending|approved|rejected` (invalid values fall back to pending) lists profiles with owner name/email, details, last review; tabs show counts. Each card offers the decisions that change the status: pending gets Approve and Reject, approved gets Reject (revoke), rejected gets Approve. Reject needs a reason. Max 100 per tab (oldest first for pending, newest first otherwise).
- **MSME dashboard:** shows the rejection reason when rejected.
- **Access:** `requireRole("admin")` in the page and the action.
- **Logging:** adminId, profileId, decision, email sent/failed. Not the reason text or emails.

## Blast Surface

New: migration, `src/lib/msme-review.ts`, `src/app/admin/msmes/{page,actions,review-actions}.tsx|ts`, `tests/msme-review.test.ts`, `e2e/admin-review.spec.ts`.
Modified: `prisma/schema.prisma`, `src/app/admin/page.tsx`, `src/app/msme/page.tsx`, `e2e/helpers.ts` (admin sign-in, MSME profile helper), docs.
Read but unchanged: `src/lib/profiles.ts` (status reset unchanged), `src/lib/email.ts`, `src/lib/authz.ts`.

## Test Strategy

- Unit: review input schema (reason required for reject, max length, decision values).
- Integration: approve sets status/reviewer/time and clears reason; reject stores reason; revoke approved to rejected; stale `profileUpdatedAt` refused and nothing changes; MSME edit after approval still resets to pending.
- E2E: admin approves a pending MSME (MSME dashboard shows Approved, email arrives in Mailpit); reject without reason blocked; reject with reason (MSME sees reason, email has reason); student and MSME can't open `/admin/msmes`.

## Documentation Impact

`docs/DATA_MODEL.md`, `docs/API.md`, `docs/DECISIONS.md` (ADR-019), `docs/CHANGELOG.md`, `docs/ROADMAP.md`, `plan/README.md`, this plan's outcome.

## Risks

- Approving content the admin didn't see: `updatedAt` guard.
- Privilege: the action re-checks the admin role; ids from the form are only the target profile.
- Email failure must not undo the decision: sent after the update, errors logged.

## Rollback

One commit; revert and `prisma migrate reset` locally.

## Outcome (2026-09-25)

Deviations from the plan:
- The review input schema lives in `src/lib/msme-review-schema.ts` (pure), so the client review form can import its limits without bundling database or email code.
- The review update is also conditional on the status actually changing, so a double submit can't send a second email.

Verification actually run:
- `npx prisma migrate dev --name msme_review` applied; nodemon regenerated the client and restarted the dev server.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`: pass.
- `npm test`: 8 files, 81 tests pass (14 new: schema; approve sets reviewer/time and clears the reason; revoke; decision refused after an MSME edit and after a repeated submit; missing profile; edit after approval resets to pending; review kept when the admin is deleted; counts).
- `npm run test:e2e`: 19 tests pass (3 new: approve with Mailpit email; reject blocked without a reason, then rejected with a reason shown to the MSME and in the email, then re-approved; student and MSME redirected from `/admin/msmes`).
- Loki: review logs carry admin/profile IDs and status only. Test data removed afterwards.

Not verified:
- A decision email delivered to a real inbox (tests use reserved test domains, routed to Mailpit; Gmail sending itself was verified earlier).
- More than 100 MSMEs in one tab (list is capped with a "Showing 100 of N" note; no pagination yet).
