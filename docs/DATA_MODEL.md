# Data Model

Naming (2026-09-26, ADR-025): the student role is `user` and MSME is `organisation`. Migration `rename_roles` renamed the enum values, `MsmeStatus` → `OrganisationStatus`, `student_profile` → `user_profile`, `msme_profile` → `organisation_profile`, `opportunity.msmeProfileId` → `organisationProfileId`, `application.studentProfileId` → `userProfileId`, and their keys and indexes, in place (no data copied). Sections below use the new names.

Source of truth: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.

## Implemented (Phase 1)

Auth tables follow Better Auth's core schema (generated with `npx auth@1.7.6 generate`). Table names are lowercase (`@@map`).

| Model | Table | Notes |
|-------|-------|-------|
| `User` | `user` | `email` unique, `emailVerified`, `role` (`Role?`). |
| `Session` | `session` | `token` unique; cascades on user delete. |
| `Account` | `account` | One per sign-in method. Email/password uses `providerId = "credential"` with the password hash; Google uses `providerId = "google"`. Cascades on user delete. |
| `Verification` | `verification` | Email verification tokens. |

`Role` enum: `user`, `organisation`, `admin`.

Role rules:
- `role` is `null` until chosen. A user without a role can only reach `/onboarding/role`.
- Only `assignInitialRole` (`src/lib/user-roles.ts`) writes it from user input: `user` or `organisation` only, and only while it is `null`.
- `admin` is only created by `npm run db:seed`.

## Implemented (Phase 2)

| Model | Table | Notes |
|-------|-------|-------|
| `UserProfile` | `user_profile` | `userId` unique (1–1 with `User`, cascade delete). `institution`, `course`, `graduationYear`, `skills String[]` (lowercase, max 20), `bio?`, `links String[]` (http/https, max 5). The user's name is `User.name`. |
| `OrganisationProfile` | `organisation_profile` | `userId` unique (1–1, cascade delete). `businessName`, `description`, `industry`, `location`, `website?` (http/https), `status OrganisationStatus` (default `pending`, indexed). |

`OrganisationStatus` enum: `pending`, `approved`, `rejected`.

Profile rules (ADR-016):
- Profiles are optional; writes go through `src/lib/profiles.ts` with the `userId` from the session.
- `status` is never read from input. Creating a profile sets `pending`. Saving a changed `approved` profile sets `pending`; saving a `rejected` profile sets `pending` (resubmission); an unchanged `approved` save stays `approved`.
- The status update is conditional on the status that was read, so it can't overwrite a concurrent review decision.

## Implemented (Phase 3)

`OrganisationProfile` review fields, describing the last admin decision:

| Field | Notes |
|-------|-------|
| `reviewedById` | FK to `User` (the admin), `onDelete: SetNull`. |
| `reviewedAt` | Time of the last decision. |
| `rejectionReason` | Required when rejecting (max 500), cleared on approval. |

Review rules (ADR-019):
- Only `reviewOrganisation` (`src/lib/organisation-review.ts`) writes them, from an admin session, for any status (approve, reject, revoke).
- The update is conditional on `updatedAt` equal to what the admin saw and on the status actually changing, so edits made after the page loaded or repeated submits are refused.
- An organisation edit that resets the status to `pending` keeps the last review fields as history.

## Implemented (Phase 4)

`Opportunity` (`opportunity`): `organisationProfileId` (OrganisationProfile 1–N, cascade delete), `type` (`freelance` | `internship`), `title`, `description`, `skills String[]` (max 15), `workMode` (`remote` | `onsite` | `hybrid`), `city?` (required unless remote), `payType` (`paid` | `unpaid`), `payAmount Int?` and `payPeriod?` (`fixed` | `month` | `hour`, both set only when paid), `duration?`, `deadline Date?` (last day to apply, India time), `status` (`draft` | `published` | `closed`), `publishedAt?`, `closedAt?`. Indexed on `organisationProfileId` and `status`.

Rules (ADR-020):
- Unpaid only for internships.
- Create, edit, publish and reopen need an approved organisation; close and delete-draft are always allowed. Only drafts can be deleted.
- Transitions: draft → published → closed → published (reopen). Publish/reopen refused when the deadline has passed. Status updates are conditional on the expected current status.
- All writes are scoped to the session user's own organisation profile (`src/lib/opportunities.ts`).
- Visibility rule (Phase 5, `src/lib/search.ts`): a listing is public only when it is `published`, its organisation is `approved`, and its deadline hasn't passed (India time).
- `embedding vector(384)`: all-MiniLM-L6-v2 of the title, type, skills and description. Written with raw SQL after each save. HNSW cosine index `opportunity_embedding_idx` (created in the migration; the schema's `@@index([embedding])` only stops Migrate from dropping it).

## Implemented (Phase 6)

`Application` (`application`): one per user per listing (`opportunityId` + `userProfileId` unique). `note?` (max 1000), `resumeFileName`, `resumeStorageKey` (generated, never from the client), `status` (`submitted` | `accepted` | `rejected` | `withdrawn`), `appliedAt`, `decidedAt?`. Cascade-deletes with the listing or the user profile.

Rules (ADR-022):
- Apply only with a user profile, and only to a visible listing. A `withdrawn` row can be submitted again; any other status blocks a second application.
- Accept and reject only from `submitted`, and only by the listing's organisation. Withdraw only from `submitted`, and only by the user.
- The resume file is readable only by that user and that organisation. Email addresses are shown only when the status is `accepted`.

## Implemented (Phase 7)

`Opportunity` gains optional `requirements` (text, max 2000), `experienceLevel` (`ExperienceLevel`: `entry` | `junior` | `mid` | `senior` | `lead`), and `compensationMin` / `compensationMax` (whole INR, min not above max). They add to, not replace, `payAmount`/`payPeriod`.

| Model | Table | Notes |
|-------|-------|-------|
| `Prompt` | `prompt` | Admin-editable LLM prompt templates. `key` unique (`resume_analysis`, `job_description`), `name`, `content` with `{{placeholders}}`, `updatedById?` (admin, `SetNull`). Seeded by the Phase 7 migration; saving creates the row if it is missing. Migration `fix_prompt_newlines` turned the seed's literal `
` into newlines in unedited rows. |
| `Analysis` | `analysis` | One per application (`applicationId` unique, cascade delete). `score Int` 0–100, `summary?`, `matchedSkills String[]`, `missingSkills String[]`, `model?`, `createdAt` (time of the last run). Upserted by `src/lib/resume-analysis.ts` (ADR-024). |

## Implemented (resume library and screening, 2026-09-26)

Migration `resume_library_screening`.

| Model | Table | Notes |
|-------|-------|-------|
| `Resume` | `resume` | A user's library resume, max 5 per `UserProfile` (cascade). `fileName` (display, renamable), `storageKey` (unique, generated), `skills String[]` (normalised, max 30), `skillsStatus` (`ResumeSkillsStatus`: `pending` \| `done` \| `failed` \| `skipped`), `skillsModel?`. |
| `OpportunityQuestion` | `opportunity_question` | Screening question of a listing (cascade). `position` (unique per listing), `prompt` (5–300), `source` (`QuestionSource`: `ai` \| `organisation`). |
| `ApplicationAnswer` | `application_answer` | One per application and question (unique pair; cascades from both). `answer` (1–2000), `score Int?` 0–100 and `feedback?` from the LLM. |

Changes to existing models:
- `Application.resumeId?` → `Resume` (SetNull). `resumeFileName` / `resumeStorageKey` remain the snapshot used for download; the key may be shared with a library resume.
- `Opportunity.aiAssistedAt?`: last listing assist.
- `Analysis.score` renamed in place to `resumeScore` and made nullable; new `answersScore?`, `answersSummary?`, `overallScore?` (indexed). Existing rows got `overallScore = resumeScore`.

Rules (ADR-031 to ADR-033):
- A resume file is deleted only when no `resume` and no `application` row references its key.
- Questions lock once the listing has any application (any status).
- `overallScore` is computed in code: 60% resume + 40% answers, or whichever exists.

## Implemented (hiring pipelines and interviews, 2026-09-26)

Migration `hiring_pipelines` (additive only). ADR-035 to ADR-037.

| Model | Table | Notes |
|-------|-------|-------|
| `PipelineStage` | `pipeline_stage` | Stage of a listing's pipeline (cascade). `position` (unique per listing, 0..n-1), `name` (1–60), `kind` (`StageKind`: `interview` \| `test` \| `assignment` \| `other`), `instructions?` (≤1000), `externalUrl?` (http/https), `durationMinutes?` (15–480), `source` (`QuestionSource`). |
| `StageEvent` | `stage_event` | History of pipeline moves: `applicationId` (cascade), `stageId` (Restrict), `outcome` (`passed` \| `failed` \| `moved`), `actorUserId?` (SetNull), `note?`. |
| `OrganisationMember` | `organisation_member` | A hiring manager of an organisation (cascade). `userId?` unique (one organisation per account; SetNull), `email` (lowercased; unique per organisation), `name`, `status` (`invited` \| `active` \| `deactivated`), `inviteTokenHash?` (SHA-256, unique, cleared on accept), `inviteExpiresAt?`, `invitedAt`, `acceptedAt?`, `deactivatedAt?`. |
| `ScheduledEvent` | `scheduled_event` | An interview or test slot for one application at one stage. `startsAt` (UTC), `durationMinutes`, `status` (`scheduled` \| `cancelled` \| `completed`), `googleEventId?`, `meetUrl?`, `calendarSync` (`pending` \| `synced` \| `failed` \| `disabled`), `calendarError?`, `createdById?`. Stage is Restrict, application cascades. |
| `EventInterviewer` | `event_interviewer` | Interviewers of an event (composite key; cascades from both): the organisation owner or active hiring managers. |
| `InterviewFeedback` | `interview_feedback` | One per event and interviewer (unique pair): `rating` 1–5, `recommendation` (`pass` \| `fail` \| `unsure`), `notes` (1–2000). Never shown to candidates. |

Changes to existing models:
- `Role` gains `hiring_manager`.
- `Application.currentStageId?` → `PipelineStage` (Restrict, indexed). Null = "Applied".
- `Opportunity.pipelineAssistedAt?`: last AI pipeline suggestion.

Rules:
- A stage that is reached (current candidates, history or scheduled events) can't be deleted or change kind or relative order, both in code and through the Restrict foreign keys.
- Invite tokens are never stored; only their hash.

## Planned

- Nothing required for the MVP. Password reset and admin role changes are later.

- Application. See `plan/2026-09-25-mvp-initial-plan.md`.
- UserProfile N–N Opportunity via Application.
