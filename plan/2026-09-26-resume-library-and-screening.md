# Implementation Plan — Resume library, AI skills, recommendations and screening

Status: shipped
Date: 2026-09-26

## Objective

1. A user profile holds several resumes. The AI extracts skills from each upload.
2. When an organisation creates a listing, the AI extracts required skills and drafts screening questions. The organisation edits both.
3. Jobs are recommended to users by comparing their resume skills with each listing's required skills.
4. Applying means picking a library resume (or uploading one) and answering the listing's questions.
5. The AI scores the resume against the listing's skills and requirements, and scores the answers. Organisations filter applicants by score and by apply time.

## Decisions (product owner, 2026-09-26)

| Topic | Decision |
|---|---|
| Questions | The AI drafts them when a listing is created; the organisation edits, adds or removes them. They are locked once the listing has any application. |
| Resumes | Library of up to 5 per profile (upload, rename, delete). Apply picks one, or uploads a new one, which also joins the library. Skills are extracted once per upload. |
| Matching | Required-skill coverage from the union of all resume skills, plus a semantic similarity bonus. No LLM call when recommendations are shown. |
| Scoring | Resume score and answer score (0–100 each) are stored separately. Overall = 60% resume + 40% answers, or 100% resume when the listing has no questions. Only organisations see scores. Filters: minimum overall score and apply time. |

Defaults chosen by the agent (open to veto):

- **The LLM stays optional (ADR-023).** When it is off:
  - listings keep the skills the organisation typed and get no drafted questions (the organisation can still write questions itself);
  - resume skills stay empty, so recommendations fall back to profile skills (today's behaviour);
  - scores show `-`, per CONSTRAINTS (no fake data).
- **Listing assist timing.** It runs synchronously when a listing is first created (30 s timeout; the save never fails because of it). AI skills are merged into the existing `skills` list (the organisation's own skills come first, capped at 15). Drafted questions are added only if the listing has none. An "AI suggest" button on the edit page re-runs it on demand and merges the same way. If a listing reaches publish without ever being assisted, publish triggers a background skills-only assist.
- **Limits.** At most 8 questions per listing, each 5–300 characters. Answers are required, 1–2000 characters each.
- **Old applications.** Existing applications keep their own resume file and get no answers. They are not added to the library (no backfill).
- **New pages.** `/user/resumes` (the library) and `/user/recommendations` (full list with match % and matched skills). The dashboard keeps its 4-card "Recommended for you".

## Current state

- `Application.resumeFileName` / `resumeStorageKey`: one uploaded file per application (`src/lib/applications.ts`, `src/lib/resumes.ts`). Withdraw-then-reapply deletes the old file.
- `Opportunity.skills String[]` is typed by the organisation. There are no questions.
- `Analysis` has one row per application: `score Int` (resume only), summary, matched/missing skills. It is written by `analyzeResume` in the background after apply, and re-run on demand by the owner (ADR-024).
- Recommendations: `getRecommended` in `src/lib/dashboard/user.ts` runs `searchOpportunities` with `q` = profile skills (hybrid semantic + keyword).
- The applicants page lists everyone, newest first, with no filters.
- Dashboards read `analysis.score` (`src/lib/dashboard/organisation.ts`, `src/lib/dashboard/admin.ts`, `src/app/organisation/page.tsx`, `src/app/admin/page.tsx`).
- `src/lib/llm/` already has the client, admin-editable prompts with defaults, and `{{placeholder}}` building.

## Data model (one migration: `resume_library_screening`)

New tables:

- **`Resume`** (`resume`)
  - Fields: `id`, `userProfileId` (cascade), `fileName`, `storageKey` (unique), `skills String[]` (normalised, max 30), `skillsStatus` (`pending | done | failed | skipped`), `skillsModel?`, `createdAt`, `updatedAt`.
  - Index on `userProfileId`.
- **`OpportunityQuestion`** (`opportunity_question`)
  - Fields: `id`, `opportunityId` (cascade), `position Int`, `prompt` (≤300), `source` (`ai | organisation`), `createdAt`.
  - Unique on (`opportunityId`, `position`).
- **`ApplicationAnswer`** (`application_answer`)
  - Fields: `id`, `applicationId` (cascade), `questionId` (FK, Restrict: questions are locked once applications exist), `answer` (≤2000), `score Int?`, `feedback?`.
  - Unique on (`applicationId`, `questionId`).

Changes to existing tables:

- **`Application`**: add `resumeId String?` (FK to `Resume`, SetNull). `resumeFileName` and `resumeStorageKey` stay as the snapshot the organisation downloads, so the download route is unchanged.
- **`Opportunity`**: add `aiAssistedAt DateTime?`.
- **`Analysis`**:
  - `score` → `resumeScore Int?` (renamed in place, now nullable);
  - add `answersScore Int?`, `answersSummary String?`, `overallScore Int?`;
  - add an index on `overallScore`.

File rule: a stored file is deleted only when no `Resume` row and no `Application` row references its `storageKey`. This holds for library delete and for reapply.

## Blast surface

**Change:**

| Area | Files |
|---|---|
| Schema | `prisma/schema.prisma`, new migration |
| LLM | `src/lib/llm/defaults.ts`, `src/lib/llm/prompts.ts` |
| Resumes | `src/lib/resumes.ts`, `src/lib/resume-analysis.ts` |
| Applications | `src/lib/applications.ts` |
| Listings | `src/lib/opportunity-schemas.ts`, `src/lib/opportunities.ts` |
| Dashboards | `src/lib/dashboard/user.ts`, `src/lib/dashboard/organisation.ts`, `src/lib/dashboard/admin.ts`, `src/app/user/page.tsx`, `src/app/organisation/page.tsx`, `src/app/admin/page.tsx` |
| Organisation listing pages | `src/app/organisation/opportunities/{opportunity-form.tsx,actions.ts,new/page.tsx,[id]/edit/page.tsx}` |
| Applicants pages | `src/app/organisation/opportunities/[id]/applicants/{page.tsx,actions.ts,resume-analysis.tsx}` |
| Public listing pages | `src/app/opportunities/[id]/{page.tsx,apply-form.tsx,actions.ts}` |
| Navigation | `src/components/app-sidebar.tsx` |

**New:**

| Area | Files |
|---|---|
| Pure logic | `src/lib/skills.ts` (normalise, merge, coverage), `src/lib/applicant-filters.ts` (parse and validate filter params) |
| Resume library | `src/lib/resume-library.ts` (CRUD, 5-cap, background skill extraction, ownership) |
| AI features | `src/lib/listing-assist.ts` (skills + draft questions), `src/lib/answer-scoring.ts` |
| Recommendations | `src/lib/recommendations.ts` |
| Pages | `src/app/user/resumes/{page.tsx,actions.ts,resume-list.tsx}`, `src/app/user/recommendations/page.tsx`, `src/app/organisation/opportunities/[id]/applicants/applicant-filters.tsx` |
| API | `src/app/api/resumes/[id]/route.ts` (owner-only download) |

**Read only:**

- `src/lib/search.ts` (visibility rule, embedding SQL);
- `src/lib/embeddings.ts`;
- `src/lib/profile-schemas.ts` (`skillList`);
- `src/app/api/applications/[id]/resume/route.ts`;
- `src/lib/flash.ts`;
- `src/components/use-action-error-toast.ts`.

**Tests:**

- Unit: new `tests/skills.test.ts`, `tests/applicant-filters.test.ts`.
- Integration: new `tests/resume-library.test.ts`, `tests/listing-assist.test.ts`, `tests/answer-scoring.test.ts`, `tests/recommendations.test.ts`. Update `tests/applications.test.ts`, `tests/resume-analysis.test.ts`, `tests/opportunities.test.ts`, `tests/opportunity-schemas.test.ts`, `tests/dashboard-*.test.ts`.
- E2E: new `e2e/resumes.spec.ts`. Update `e2e/applications.spec.ts`, `e2e/opportunities.spec.ts`, `e2e/helpers.ts`.

**Docs:** `DATA_MODEL.md`, `ARCHITECTURE.md`, `API.md`, `DECISIONS.md` (ADR-031 resume library and file references, ADR-032 listing assist and screening questions, ADR-033 matching and scoring), `REQUIREMENTS.md` (FR-8 to FR-11), `CHANGELOG.md`, `ROADMAP.md`, `BLOCKERS.md`, `plan/README.md`.

No new dependencies. No infrastructure change.

## Key designs

**Skills.** `normalizeSkill` does the following:

- lowercase and trim;
- collapse whitespace;
- strip trailing `.js`/`js` variants to a canonical form via a small alias map (`reactjs` / `react.js` → `react`, `node` → `node.js`, and so on).

The alias map is intentionally small: the semantic term covers the rest. Both job and resume skills are stored normalised.

**Listing assist** (`listing_assist` prompt).

- Input: title, type, description, requirements, and the organisation's skills, all wrapped in `<listing>` tags as data.
- Output JSON: `{ skills: string[≤15], questions: string[3–5] }`, parsed defensively like `parseAnalysisOutput`.

**Resume skills** (`resume_skills` prompt).

- Input: resume text from `extractResumeText`, in `<resume>` tags, truncated at 12k characters.
- Output: `{ skills: string[≤30] }`.
- Runs as a background job after upload; `skillsStatus` tracks progress. Failures set `failed`, with a Retry action.

**Recommendations** (`src/lib/recommendations.ts`). One SQL query over visible listings, excluding listings the user has applied to:

```
coverage   = |normalised o.skills ∩ candidate skills| / max(|o.skills|, 1)
similarity = 1 - (o.embedding <=> embed(candidate skills text))   -- 0 if no embedding
match      = 0.7 * coverage + 0.3 * similarity
```

- Candidate skills are the union of resume skills where `skillsStatus = done`, falling back to profile skills.
- Keep results with `match ≥ 0.25`, ordered by match. The threshold is tuned on test data, like ADR-021.
- The page shows match % and the matched skills. The dashboard uses the top 4, and falls back to "Latest opportunities" as it does today.

**Apply.**

- The form offers a radio list of the user's library resumes plus "Upload new" (validated as today; an upload creates a `Resume` row, respecting the 5-cap, then applies), followed by one required textarea per question.
- The server checks:
  - resume ownership;
  - the question set equals the listing's current questions;
  - answer lengths.
- The application and its answers are written in one transaction. Reapply after withdraw replaces the answers.
- After commit, `analyzeApplication(id)` runs in the background.

**Analysis** (`analyzeApplication` replaces `analyzeResume` as the entry point):

1. Resume score: the existing flow. The prompt now also gets the listing's (AI-augmented) skills.
2. Answers score: one `answer_scoring` call with every question and answer in `<answer>` tags. It returns a per-question `{score, feedback}` plus an overall `answersScore` and `summary`.
3. Overall score: computed in code (never by the LLM) from whichever parts succeeded:
   - both scores → 60/40;
   - only one score → that score;
   - neither → null.
4. The `Analysis` row is upserted and per-answer scores are updated.

The owner-triggered re-analyse covers both parts.

**Applicants page filters.** Parsed from `searchParams` by the pure `parseApplicantFilters`; invalid values fall back to defaults.

| Parameter | Values | Default |
|---|---|---|
| `minScore` | any, 50, 70, 85 | any |
| `applied` | any, 24h, 7d, 30d, or a `from`/`to` date | any |
| `sort` | `score` (overall desc, nulls last), `newest`, `oldest` | `score` |

- Filtering happens in the Prisma query, always scoped to the owner.
- A score filter excludes unscored applicants and says so ("N not yet scored").
- Filters live in a GET `<form>`, so URLs are shareable. They stack on mobile.
- Each card shows overall / resume / answers scores (`-` when null) and an expandable list of each question, answer, score and feedback.

**Security.**

- Every read and write is scoped by the session user.
- Library downloads are owner-only. An organisation downloads only through the existing application route.
- Candidate-facing pages never select analysis or answer scores.
- All user and organisation text sent to the LLM is delimited as data, with the system message from ADR-024.

## Implementation sequence

0. **Prerequisite (your call):** the working tree has several shipped but uncommitted plans (the rename, toasts, Phase 7 hardening). Commit them first so this change has a clean diff.
1. Baseline: Docker up; `npm run typecheck`, `lint`, `test`.
2. Schema and migration. Run `prisma migrate dev` and check that `migrate diff` is empty.
3. Pure modules and their unit tests: `skills.ts`, `applicant-filters.ts`, schema changes for questions and answers.
4. LLM prompts and defaults; `listing-assist.ts`, `answer-scoring.ts`, resume-skill extraction, each with a stubbed-`fetch` test.
5. Resume library: lib, pages, download route, nav, file-reference rule.
6. Listings: assist on create, question editor in the form, lock after the first application, publish fallback.
7. Apply: library picker, answers, transaction, `analyzeApplication`.
8. Scoring rename in dashboards (`score` → `overallScore` / `resumeScore`).
9. Applicants page: filters, scores, answers.
10. Recommendations lib, the dashboard section, `/user/recommendations`.
11. Tests: full vitest, typecheck, lint, build; the Playwright specs above (`--workers=1` if the cold server times out). Manual responsive check at 375 / 768 / 1280 px.
12. Review (`/review`), then docs, plan index, commit.

## Test strategy

| Level | Coverage |
|---|---|
| Unit | Normalise, merge and coverage maths; filter parsing (invalid → default); question and answer validation; overall-score weighting (both, resume only, answers only, none); JSON parse of each new LLM output (fenced, missing keys, out-of-range scores). |
| Integration (Postgres, stubbed `fetch`) | 5-resume cap; ownership on rename, delete and download; a file is kept while an application references it; reapply keeps a library file; skill extraction sets `done` or `failed`; assist merges skills without overwriting and drafts questions only when there are none; questions are locked once an application exists; apply rejects foreign resumes and missing or extra answers; `analyzeApplication` stores all scores and per-answer scores; re-analyse is owner-only; recommendation ordering and exclusion of applied, closed and unapproved listings; applicant filters and sort; LLM disabled → nulls, no throw. |
| E2E (LLM disabled) | Upload two resumes and rename/delete one; an organisation writes questions manually; a user applies by picking a library resume and answering; the organisation filters by date and sees `-` scores; the existing applications flow still passes. |
| Not automatable | A real LLM call (stubbed as in Phase 7). A manual check with a real key is recommended. |

## Risks

- **Cost.** Listing create, each resume upload and each application make 1–2 LLM calls. Library upload/delete cycling can repeat extraction; this is recorded as a known limitation, with no rate limit in this change.
- **Latency.** Listing create waits up to 30 s for the assist. The UI shows a pending state, and a timeout still saves the listing.
- **Matching quality.** The alias map and the 0.25 threshold are heuristics, tuned on small data.
- **LLM output variability.** Parsing is defensive. Invalid output stores nothing and the UI shows `-` plus a re-analyse option.
- **Migration.** Renaming `analysis.score` touches three dashboards. The rename happens in place, and existing scores become `resumeScore`; `overallScore` is backfilled to equal it.
- **Scope size.** This is large. If you want smaller reviews, split it into 3 commits: (a) library + skills, (b) listing assist + questions + apply, (c) scoring + filters + recommendations.

## Rollback

Revert the commits and roll back the migration with a down SQL written alongside it:

- drop the new tables and columns;
- rename `resumeScore` back to `score` (null → 0 is not acceptable, so rows with a null resume score are deleted).

Uploaded library files stay on disk, unreferenced.

## Outcome (2026-09-26)

Approved by the product owner ("do it"). Step 0 done: the pending shipped work was committed first (`546a966`).

Deviations from the plan:
- ADR and FR numbers are ADR-031 to ADR-033 and FR-8 to FR-11: a parallel session took ADR-029, ADR-030 and FR-7 for the dashboards. ADR-033 supersedes ADR-030.
- `application_answer.questionId` cascades instead of Restrict, so deleting a listing can't be blocked by answers; the lock is enforced in code.
- The listing assist is called from the server action, not inside `createOpportunity`, so the listing library stays free of LLM calls.
- Recommendation coverage is computed in code over up to 300 visible listings (ordered by similarity), not by SQL array intersection, so skill aliases apply to both sides.
- New `src/lib/background.ts` (`runInBackground` / `settleBackground`). Tests needed a way to wait for background analysis and extraction, which otherwise raced with the stubbed LLM.
- Only "Resumes" was added to the user nav. The phone tab bar got short labels ("Jobs", "Applied") so five links fit at 320px.

Found and fixed during implementation and review:
- `asData` tag stripping used `` inside a template literal (a backspace), so injected closing tags were not removed. It was caught by a unit test and now uses `String.raw`.
- The resume cap used Serializable isolation, which made different users' concurrent uploads fail. It now uses a row lock on the profile.
- Long resume names overflowed the apply card; the apply panel is no longer sticky when it has questions (its end would be unreachable).
- On phones the date-range inputs rendered below the filter buttons.
- When the listing assist threw, the organisation got a plain success toast; it now says AI was unavailable.

Rollback SQL (Prisma has no down migrations; run by hand, then delete the migration row):

```sql
ALTER TABLE application DROP COLUMN "resumeId";
DROP TABLE application_answer, opportunity_question, resume;
DROP TYPE "ResumeSkillsStatus"; DROP TYPE "QuestionSource";
ALTER TABLE opportunity DROP COLUMN "aiAssistedAt";
DELETE FROM analysis WHERE "resumeScore" IS NULL;
ALTER TABLE analysis DROP COLUMN "answersScore", DROP COLUMN "answersSummary", DROP COLUMN "overallScore";
ALTER TABLE analysis RENAME COLUMN "resumeScore" TO score;
ALTER TABLE analysis ALTER COLUMN score SET NOT NULL;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260926020000_resume_library_screening';
```

## Verification (2026-09-26)

Environment: Docker Compose services (Postgres on 127.0.0.1:5432, Mailpit, Loki) and the `next-dev` container on :3000. The LLM is disabled locally (`LLM_PROVIDER=enabled` is invalid), which is what the e2e specs expect.

- `prisma migrate dev`: applied. `prisma migrate diff` from the database to the schema: empty.
- `npm run typecheck`, `npm run lint`: pass.
- `npm test`: 27 files, 256 tests, passed 3 consecutive full runs. New: `skills`, `applicant-filters`, `screening-parsers` (unit), `screening` (integration against Postgres, stubbed `fetch`, mocked embeddings).
- `npm run build`: pass. Its 4 "dynamic filesystem access" warnings come from the existing `readResume` and also appear without these changes.
- Playwright, full suite with 2 workers: 39/39 pass twice, including the new `e2e/screening.spec.ts`.
- Responsive: screenshots at 375, 768 and 1280 px of the new listing form, the resume library, recommendations, the apply form and the applicants page, reviewed by eye. `scrollWidth > clientWidth` was false on every page and width.

Not verified:
- A real LLM (all AI paths use stubbed replies), so the new prompts are untuned.
- Recommendation quality with real embeddings (the integration test mocks them).
- The production Docker image (`docker compose build next`).
- A real concurrent-apply race against a question edit.
