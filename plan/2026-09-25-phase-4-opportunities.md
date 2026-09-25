# Implementation Plan — Phase 4: Opportunities

Status: shipped (2026-09-25)
Date: 2026-09-25
Parent plan: `plan/2026-09-25-mvp-initial-plan.md`

## Objective

Approved MSMEs create, edit, publish, close, reopen and delete (drafts only) freelance and internship listings.

## Current State

Phase 3: MSMEs are approved/rejected by an admin. No listings.

## Decisions (user, 2026-09-25)

1. Pay: `payType` paid/unpaid; when paid, `payAmount` (whole INR) and `payPeriod` (fixed, month, hour). Unpaid only for internships.
2. Location: `workMode` remote/onsite/hybrid; `city` required unless remote.
3. Only approved MSMEs create listings.
4. Listings of an MSME that is no longer approved stay `published` but are hidden from students (visibility rule, enforced in Phase 5 browse).
5. Lifecycle draft → published → closed; published stays editable; closed can be reopened; only drafts can be deleted.
6. Deadline optional; once passed, the listing no longer accepts applications and is hidden from browse (Phases 5–6).

Agent decision: create, edit, publish and reopen need an approved MSME; close and delete-draft are always allowed (they only reduce exposure).

## Design

- **Model** `Opportunity` (`opportunity`, migration `opportunities`): `id`, `msmeProfileId` (FK, cascade), `type`, `title`, `description`, `skills String[]`, `workMode`, `city?`, `payType`, `payAmount Int?`, `payPeriod?`, `duration?` (free text), `deadline DateTime? @db.Date`, `status` (default `draft`), `publishedAt?`, `closedAt?`, timestamps. Indexes on `msmeProfileId`, `status`. Enums `OpportunityType`, `OpportunityStatus`, `WorkMode`, `PayType`, `PayPeriod`.
- **Validation** (`src/lib/opportunity-schemas.ts`, pure): title 5–120, description 1–5000, skills as in profiles (max 15), city required unless remote, pay rules above (amount 1–10,000,000), duration ≤ 60, deadline `YYYY-MM-DD` not before today in India (Asia/Kolkata). Helpers `todayInIndia`, `isDeadlinePassed`, `formatPay`. The skills parser is exported from `profile-schemas.ts` and reused.
- **Data** (`src/lib/opportunities.ts`): every function takes the session `userId` and scopes by `msmeProfile.userId`, so an MSME can only touch its own listings. Results are unions (`not_approved`, `not_found`, `invalid_state`, `deadline_passed`). Status changes are conditional updates on the expected current status. Publish/reopen refuse a passed deadline.
- **Pages** (all `requireRole("msme")`): `/msme/opportunities` (own listings with status, pay, deadline and actions), `/msme/opportunities/new`, `/msme/opportunities/[id]/edit`. Not-approved MSMEs see an explanation instead of the form. MSME dashboard links to listings.
- **Logging:** userId, opportunityId, action/status. No listing text.

## Blast Surface

New: migration, `src/lib/opportunity-schemas.ts`, `src/lib/opportunities.ts`, `src/app/msme/opportunities/{page,actions,opportunity-form,opportunity-actions}.tsx|ts`, `.../new/page.tsx`, `.../[id]/edit/page.tsx`, `tests/opportunity-schemas.test.ts`, `tests/opportunities.test.ts`, `e2e/opportunities.spec.ts`.
Modified: `prisma/schema.prisma`, `src/lib/profile-schemas.ts` (export skills parser), `src/app/msme/page.tsx` (link), docs.

## Test Strategy

- Unit: every validation rule; deadline/today logic; pay formatting.
- Integration: create refused unless approved; owner scoping for update/status/delete; transitions and invalid ones; delete only drafts; publish/reopen refused with a passed deadline; close allowed when not approved; cascade on MSME delete.
- E2E: approved MSME creates a draft, publishes, edits, closes, reopens; deletes a draft; unpaid freelance rejected; pending MSME can't create; student can't open MSME listing pages.

## Documentation Impact

`docs/DATA_MODEL.md`, `docs/API.md`, `docs/DECISIONS.md` (ADR-020), `docs/CHANGELOG.md`, `docs/ROADMAP.md`, `plan/README.md`, outcome here.

## Risks

- Cross-MSME writes: all queries scoped by session user; tested.
- Leaking hidden listings: Phase 5 must apply published + approved MSME + deadline not passed on the server.

## Rollback

One commit; revert and `prisma migrate reset` locally.

## Outcome (2026-09-25)

Deviations from the plan:
- The listing form submits through `onSubmit` + `startTransition` instead of the form `action` prop: React 19's automatic reset after a failed save left the controlled pay/work-mode inputs out of sync with the page.
- The pay period dropdown is labelled "Pay period" (it clashed with the "Paid" radio button).

Verification actually run:
- `npx prisma migrate dev --name opportunities` applied; client regenerated.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`: pass.
- `npm test`: 10 files, 116 tests pass (35 new: validation rules, India-time deadline, pay formatting; create needs approval, cross-MSME read/edit/status/delete refused, publish/close/reopen, wrong-state transitions, published stays editable, passed deadline refused, close allowed after losing approval, drafts-only delete, cascade).
- `npm run test:e2e`: 23 tests pass on two consecutive runs (4 new: create draft, publish, edit, close, reopen; unpaid freelance refused with input kept, then draft deleted; pending MSME can't create; student redirected).
- Test data removed afterwards (0 leftover users or listings).

Not verified:
- Nobody but the MSME can see listings yet; the student-facing visibility rule arrives in Phase 5.
- The deadline boundary at midnight India time is unit-tested with fixed dates only.