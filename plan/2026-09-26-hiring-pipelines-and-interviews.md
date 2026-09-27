# Hiring pipelines, interviews and Hiring Managers

Status: in-progress
Date: 2026-09-26

## Objective

Organisations attach a customizable hiring pipeline to each listing (Interview 1, Test 1, Assignment, …), move candidates through it, schedule interviews and tests (Google Calendar event, with a Google Meet link for interviews, sent to candidate and interviewers), and invite employees as a new **Hiring Manager (HM)** role with their own dashboard. Pipelines can be suggested by the LLM from the listing's JD. An "AI Hiring Manager" option is shown but disabled ("coming soon").

## User decisions (/grill-me, 2026-09-26)

| # | Question | Decision |
|---|----------|----------|
| D1 | Whose Google account creates events / Meet links | **One platform Google account** (refresh token in `.env`) creates every event and invites attendees. **A personal (consumer Gmail) account is acceptable for now** (user, 2026-09-26); use a dedicated account, not a person's own. |
| D2 | What a non-interview stage is | **Tracked step + optional scheduled slot**: name, kind, instructions, optional external link; can be scheduled (calendar invite, no Meet). No on-platform test engine. |
| D3 | How HM accounts are created | **Email invite link**: single-use, expiring (7 days); HM signs up/in with that email (password or Google); role `hiring_manager` bound to that org. Org can revoke/deactivate. |
| D4 | HM permissions | **Assigned interviews + feedback only**: HM sees interviews they are assigned to (time, Meet link, candidate name, resume, screening answers, listing) and submits feedback (rating 1–5, recommend pass/fail/unsure, notes). Org owner schedules and decides. |
| D5 | Pipeline vs application status | **Pipeline wraps accept/reject**: submitted = implicit "Applied" stage; fail any stage → `rejected` (existing email); pass last stage → `accepted` (existing email). Direct accept/reject still allowed. Listings without a pipeline behave as today. |
| D6 | Pipeline storage/editing | **Per listing, copyable, soft-lock**: max 10 stages; "Copy from another listing" and "Suggest with AI". Freely editable until a candidate reaches a stage; a stage that holds candidates or history can't be deleted or moved; new stages can be added after it. |
| D7 | Scheduling | **Org picks time, can reschedule/cancel**: date, start, duration (India time), 1+ interviewers (HMs and/or org owner). Reschedule/cancel updates/deletes the Google event and notifies everyone. Candidate sees it on their applications page. No self-booking. |

Defaults chosen without asking (record as ADRs; reversible):
- AI HM: a disabled "AI Hiring Manager — coming soon" choice in the interviewer picker. No schema, no logic.
- One HM account belongs to exactly one organisation. An invite to an email whose account already has another role is refused with a clear message (one role per account, ADR-013).
- An HM who is deactivated keeps past feedback; loses access immediately; is removed from future interviews (org is told to reassign).
- Google Calendar not configured → scheduling still works; no Meet link (UI shows "-"), VenturePath emails still sent, sync status `disabled`.
- Non-production: attendees on reserved domains (`.local`, `.test`, …) are not sent to Google (they would bounce); they still get the VenturePath email via Mailpit (ADR-018 pattern).

## Current state

- Roles `user | organisation | admin` (`prisma/schema.prisma` enum `Role`; `src/lib/roles.ts`; `src/lib/auth.ts` additionalFields; `src/proxy.ts` matcher; `src/components/app-sidebar.tsx` `NAV`).
- `Application.status` `submitted | accepted | rejected | withdrawn`; `decideApplication` in `src/lib/applications.ts` does conditional update + background email.
- Listing edit page `src/app/organisation/opportunities/[id]/edit/page.tsx` with `AiSuggest` + `questions-editor.tsx` (pattern to copy for the pipeline editor).
- LLM via `src/lib/llm/*` (fetch, no SDK; prompts admin-editable via `PROMPT_KEYS`); `listing-assist.ts` is the pattern for AI suggestions.
- Google is used only for sign-in (Better Auth `socialProviders.google`, default scopes).
- Email via `sendEmail` (`src/lib/email.ts`), background via `runInBackground`.

## External research

- Google Calendar API `events.insert`/`patch` with `conferenceDataVersion=1` and `conferenceData.createRequest.requestId` creates a Meet link; creation is asynchronous (status `pending` → `success`). `sendUpdates=all` emails attendees. Source: developers.google.com/workspace/calendar/api/guides/create-events (fetched 2026-09-26).
- Verified (developers.google.com/identity/protocols/oauth2#expiration, fetched 2026-09-26): "A Google Cloud Platform project with an OAuth consent screen configured for an external user type and a publishing status of 'Testing' is issued a refresh token expiring in 7 days, unless the only OAuth scopes requested are a subset of name, email address, and user profile." Personal accounts can only use the External user type, so in Testing the token must be re-issued weekly (`npm run google:calendar-token`). Preferred: set publishing status to "In production" unverified (only the platform account consents; unverified-app warning shown once).
- Not yet verified (verify in WP3 before relying on it): refresh tokens of an unverified "In production" app don't have the 7-day expiry; service accounts can't invite attendees / create Meet without Workspace domain-wide delegation; `calendar.events` is a sensitive scope (unverified app: warning screen, 100-user cap); daily invite limits of consumer Calendar accounts.

## Desired state — data model (migration `hiring_pipelines`)

```
enum Role                 += hiring_manager
enum StageKind            interview | test | assignment | other
enum MemberStatus         invited | active | deactivated
enum StageOutcome         passed | failed | moved      // moved = org moved candidate without verdict
enum ScheduleStatus       scheduled | cancelled | completed
enum CalendarSync         synced | pending | failed | disabled
enum Recommendation       pass | fail | unsure

PipelineStage       id, opportunityId→Opportunity(Cascade), position, name(1–60), kind,
                    instructions?(≤1000), externalUrl?(http/https), durationMinutes?(15–480),
                    source(ai|organisation → reuse QuestionSource), createdAt, updatedAt
                    @@unique([opportunityId, position])
Application         + currentStageId? → PipelineStage(Restrict)   // null = "Applied"
StageEvent          id, applicationId(Cascade), stageId(Restrict), outcome, actorUserId?(SetNull), note?, createdAt
OrganisationMember  id, organisationProfileId(Cascade), userId? @unique (SetNull), email, name, status,
                    inviteTokenHash? @unique, inviteExpiresAt?, invitedAt, acceptedAt?, deactivatedAt?
                    @@unique([organisationProfileId, email])
ScheduledEvent      id, applicationId(Cascade), stageId(Restrict), startsAt, durationMinutes, status,
                    googleEventId?, meetUrl?, calendarSync, calendarError?, createdById?(SetNull), timestamps
                    @@index([startsAt])
EventInterviewer    scheduledEventId(Cascade), userId(Cascade)  @@id([scheduledEventId, userId])
InterviewFeedback   id, scheduledEventId(Cascade), interviewerUserId(Cascade), rating 1–5,
                    recommendation, notes(≤2000), submittedAt, updatedAt
                    @@unique([scheduledEventId, interviewerUserId])
```
Invite tokens: 32 random bytes, only the SHA-256 hash stored. Deleting a stage with events/candidates is prevented both in code (soft-lock, D6) and by `Restrict`.

## Desired state — routes and modules

| Area | New / changed |
|------|---------------|
| Roles/auth | `hiring_manager` in `ROLES`, `HOME_PATHS` → `/hiring-manager`, `SIGN_IN_PATHS` → `/hiring-manager/sign-in`, no sign-up path; `signInPathForArea`; proxy matcher `/hiring-manager/:path*`, `/invite/:path*`; `requireRole` unchanged. `assignInitialRole` stays user/organisation only; HM role is written only by `acceptInvite`. |
| Invites | `src/lib/team.ts`: `inviteMember`, `resendInvite`, `revokeInvite`, `deactivateMember`, `acceptInvite(token, sessionUser)` (token valid + unexpired + email matches + role null or already HM of same org → set role, link user, status active; single-use via conditional update). Page `/invite/[token]` (public landing → sign-up/sign-in with return URL → accept). Org page `/organisation/team`. |
| Pipeline | `src/lib/pipeline-schemas.ts` (zod, pure), `src/lib/pipelines.ts` (get/save with soft-lock, copy from own listing), `src/lib/pipeline-assist.ts` + prompt key `pipeline_suggest` (JSON `{stages:[{name,kind,instructions,durationMinutes}]}`; fills only an empty pipeline or returns suggestions for the editor to apply). Editor component `pipeline-editor.tsx` on the listing edit page (below questions). |
| Progression | `src/lib/pipeline-progress.ts`: `advanceCandidate`, `failCandidate`, `moveCandidate` — owner-scoped, conditional on `currentStageId` read, write `StageEvent`, call existing accept/reject path (refactor `decideApplication` internals into a shared tx-aware helper; public behaviour unchanged). |
| Calendar | `src/lib/google-calendar.ts` (fetch; token refresh with `oauth2.googleapis.com/token`; `createEvent`, `updateEvent`, `cancelEvent`; `withMeet` flag; 15 s timeout; returns typed result, never throws to callers). Env: `GOOGLE_CALENDAR_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID` (default `primary`), reuses `GOOGLE_CLIENT_ID/SECRET`. Script `scripts/google-calendar-token.ts` (loopback OAuth to obtain the refresh token; `npm run google:calendar-token`). |
| Scheduling | `src/lib/scheduling.ts`: `scheduleEvent`, `rescheduleEvent`, `cancelEvent` (owner-scoped; interviewers must be active members of the org or the owner; candidate must be at that stage; DB row first, Google sync in background with `calendarSync` status + "Retry sync"; VenturePath email with ICS-free text + Meet link to candidate and interviewers). Applicants page gets a stage column, stage filter, and a candidate panel with Advance / Fail / Schedule. |
| HM area | `/hiring-manager` dashboard (`src/lib/dashboard/hiring-manager.ts`: upcoming, today, awaiting my feedback, completed counts), `/hiring-manager/interviews/[id]` (details, Meet link, resume download, answers, feedback form). Resume route `api/applications/[id]/resume` allows an HM assigned to an interview on that application. |
| User area | `/user/applications` shows current stage name and upcoming scheduled events (time, Meet link). No feedback, no scores. |
| Org area | Nav: + "Team". Applicants page shows feedback per interview. Org dashboard: + upcoming interviews count (one tile). |
| Admin | Prompt `pipeline_suggest` appears automatically at `/admin/settings`. |

## Blast surface

- Schema/migrations: `prisma/schema.prisma`, new migration, `prisma/seed.ts` (no change expected).
- Auth/roles: `src/lib/roles.ts`, `src/lib/auth.ts` (role type list comes from `ROLES`), `src/lib/role-sign-in.ts`, `src/app/auth/continue/route.ts`, `src/proxy.ts`, `src/app/dashboard/page.tsx` (via `homePathFor`), `src/components/app-sidebar.tsx`, `src/lib/user-roles.ts` (must keep refusing HM/admin).
- Applications: `src/lib/applications.ts` (`decideApplication` refactor, `listApplicants` + stage), `src/app/api/applications/[id]/resume/route.ts` (HM access), `src/app/user/applications/page.tsx`.
- Listing edit: `src/app/organisation/opportunities/[id]/edit/page.tsx`, new `pipeline-editor.tsx`, `actions.ts`.
- Applicants: `src/app/organisation/opportunities/[id]/applicants/{page,actions}.tsx|ts`, `src/lib/applicant-filters.ts`.
- LLM: `src/lib/llm/prompts.ts` (`PROMPT_KEYS`), `src/lib/llm/defaults.ts`.
- Env/config: `src/lib/env.ts`, `.env.example`, `docker-compose.yml` (pass new env), `package.json` (script).
- Dashboards: `src/lib/dashboard/organisation.ts`, new `hiring-manager.ts`; `src/lib/dashboard/statuses.ts`.
- Email: new templates only (via `sendEmail`).
- Tests: new `tests/*.test.ts` per module; update `roles.test.ts`, `role-sign-in.test.ts`, `app-sidebar.test.ts`, `applications.test.ts`, `env.test.ts`; new e2e specs.
- Docs: `docs/{REQUIREMENTS,ARCHITECTURE,DATA_MODEL,API,DECISIONS,CHANGELOG,ROADMAP,BLOCKERS}.md`, `.env.example`, `README.md` (Google Calendar setup).
- Read, not changed: `src/lib/background.ts`, `src/lib/email.ts`, `src/lib/llm/provider.ts`, `src/lib/listing-assist.ts`, `questions-editor.tsx`, `src/components/dashboard/*`.

## Execution — parent agent + Sonnet subagents

The parent (this session, Opus) owns contracts, the migration, integration, debugging and Pillars 4–5. Subagents (`model: sonnet`) each own a **disjoint file set**, work in the shared tree (no worktrees, so they see the migrated schema), must not run `prisma migrate` or edit files outside their set, and must run `npm run typecheck`, `npm run lint` and their own `vitest` files before reporting. Each gets: this plan, its WP section, file ownership list, the contract file, and "report: files changed, commands run + results, open issues".

**Wave 0 — parent (serial)**
- WP0: schema + migration `hiring_pipelines` + `prisma generate`; `src/lib/roles.ts` (`hiring_manager`); contracts file `src/lib/hiring/types.ts` (exported types + function signatures for WP1–WP5, so waves can run in parallel); env vars in `env.ts` + `.env.example`; prompt key + default. Verify: `prisma migrate dev`, `prisma migrate diff` empty, typecheck, full vitest still green.

**Wave 1 — parallel (3 Sonnet agents)**
- WP1 Team & HM auth: `team.ts`, `/invite/[token]`, `/hiring-manager/sign-in`, `/organisation/team` (+ actions, form), proxy, `role-sign-in.ts`, `auth/continue`, sidebar NAV (HM + org "Team"). Tests: `team.test.ts` (token hash, expiry, single-use, email mismatch, existing other role, revoke, deactivate), roles/sidebar/sign-in tests updated.
- WP2 Pipeline builder + AI: `pipeline-schemas.ts`, `pipelines.ts`, `pipeline-assist.ts`, `pipeline-editor.tsx`, edit page + listing actions (pipeline part only). Tests: schemas, soft-lock rules, copy, assist parser with stubbed fetch.
- WP3 Google Calendar: `google-calendar.ts`, `scripts/google-calendar-token.ts`, npm script, `docker-compose.yml` env passthrough. Tests: stubbed fetch — token refresh + cache, create with/without Meet, patch, delete, 401/5xx/timeout → typed failure, reserved-domain attendee filtering, disabled when env missing.

**Wave 2 — parallel (2 Sonnet agents), after Wave 1 is merged and green**
- WP4 Progression + scheduling: `pipeline-progress.ts`, `scheduling.ts`, `applications.ts` refactor, applicants page/actions/filters, user applications page, emails. Tests: advance/fail/move incl. last-stage accept and email, stale `currentStageId` refusal, schedule/reschedule/cancel with stubbed calendar, interviewer must be active member, candidate not at stage refused, sync failure → `failed` + retry.
- WP5 HM dashboard + feedback: `dashboard/hiring-manager.ts`, `/hiring-manager` pages, feedback action, resume route HM access, org feedback display component (consumed by WP4's page via a named slot/component), org dashboard tile. Tests: HM sees only assigned events, deactivated HM sees nothing, feedback upsert + validation, resume access matrix.

**Wave 3 — parent**
- Integrate, fix cross-WP breakage, full `npm run typecheck && npm run lint && npm test`, then one Sonnet agent writes e2e (`e2e/pipeline.spec.ts`, `e2e/hiring-manager.spec.ts`: build pipeline, invite HM via Mailpit link, schedule, HM sees interview and submits feedback, advance to accepted; phone + desktop viewport). Parent runs them, then Pillar 4 review (`/review`, security focus on invite tokens, HM authorization, calendar token handling) and Pillar 5 docs + commit.

## Test strategy

- Unit/integration (Vitest, real test DB, stubbed `fetch` for Google and LLM) per WP as listed.
- Authorization matrix test: org A cannot see/modify org B pipelines, members, events; HM of org A cannot open org B events or unassigned events; user cannot hit org/HM actions.
- E2E (Playwright) as in Wave 3; responsive check at 320px, tablet and desktop (NFR-4).
- Live Google check (manual, once refresh token exists): schedule a real interview to two real addresses, confirm invites + Meet link; record result in `BLOCKERS.md`.

## Documentation impact

REQUIREMENTS (FR-12 pipelines, FR-13 scheduling + Meet, FR-14 Hiring Managers, FR-15 AI pipeline suggestions; AI HM noted as not available), DATA_MODEL, ARCHITECTURE (new modules, code-layout rows), API (new actions/routes), DECISIONS (ADR-035 platform Google account for Calendar/Meet; ADR-036 HM role via invite; ADR-037 pipeline soft-lock + status wrapping), CHANGELOG, ROADMAP (AI HM, per-org Google connect, candidate self-booking, on-platform tests as Later), BLOCKERS (Google refresh token setup; OAuth testing-mode 7-day expiry; sensitive-scope verification before production), README (Calendar setup), `.env.example`.

## Risks

- **Google setup (blocker for live Meet)**: needs a platform Google account, `calendar.events` scope added to the OAuth client, and a refresh token. In "Testing" publishing status tokens may expire every 7 days (to verify). Mitigation: feature degrades to no-Meet; clear admin-visible sync status; token script.
- **Role expansion regressions**: every `Record<Role, …>` must gain `hiring_manager` (TypeScript will flag them). `assignInitialRole` must not accept it (test).
- **Invite security**: token leakage → hash at rest, single-use, 7-day expiry, bound to email, rate of invites per org capped (e.g. 20 pending).
- **Data exposure**: HMs must see only assigned candidates; candidate contact email not shown to HM (Meet invite from Google does reveal attendee emails to each other — accepted by D1; document it).
- **Concurrency**: stage moves and scheduling are conditional updates on the state read (existing pattern).
- **Parallel agents**: file-ownership collisions → strict ownership lists; shared files (`app-sidebar.tsx`, `applications.ts`) owned by exactly one WP.
- **Scope size**: ~40 files. If Wave 1 shows the contracts are wrong, stop and re-plan (AGENTS.md).

## Rollback

Single migration adds tables/columns/enum values only (no data rewrite); rollback = revert commit + a down migration dropping the new tables/columns (Postgres can't drop an enum value; `hiring_manager` would remain unused). Feature is inert for listings without a pipeline.
