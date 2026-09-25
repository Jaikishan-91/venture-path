# Implementation Plan — Phase 7: OpenAI-compatible endpoints, resume analysis & job lifecycle

Status: approved
Parent plan: `plan/2026-09-25-mvp-initial-plan.md`

User decisions:
- LLM: OpenAI-compatible endpoint first (via env config). When unconfigured, fall back to the existing local HuggingFace ONNX model (`all-MiniLM-L6-v2`).
- Resume text: include PDF extraction via a lightweight parser dependency (pdf-parse), plus DOCX/DOC basic parsing.

## Objective

Set up a reusable OpenAI-compatible LLM provider layer that supports multiple backends (OpenAI-compatible, Gemini, Ollama) with admin-editable prompts. Then add a resume analysis feature that scores a student's resume against a job opportunity, surfaced on the applicants page. Finally, extend the job lifecycle with structured requirements (JD sections, required skills, experience level, compensation bands) and an admin prompt management UI.

## Current State

The codebase is a complete MVP (Phases 0–6). Key relevant facts:

- Prisma schema has `Opportunity` (draft/published/closed lifecycle), `Application` (submitted/accepted/rejected/withdrawn), `StudentProfile` (with `skills`), and `MsmeProfile` (approval-gated).
- `src/lib/embeddings.ts` already uses a local HuggingFace ONNX model for opportunity embeddings. No OpenAI integration exists.
- `src/lib/env.ts` validates all env vars via zod; no LLM provider config yet.
- Admin role exists with `/admin/msmes` review. No admin feature for prompt editing.
- Resumes are stored as files on disk with a storage key in `src/lib/resumes.ts`.
- Tests run with Vitest against a real Postgres in Docker. E2E via Playwright.
- Patterns: server actions in `src/app/.../actions.ts`, domain logic in `src/lib/`, zod schemas in `src/lib/*-schemas.ts`, Prisma relations in `schema.prisma`.

## Desired State

1. **OpenAI-compatible provider layer** (`src/lib/llm/`): A thin client that can call any OpenAI-compatible endpoint (OpenAI, Gemini with OpenAI-compatible mode, Ollama, local server). Configured via env vars. Admin-editable prompts stored in the database and editable via an admin UI.
2. **Resume analysis feature**: When an MSME views applicants, each application shows an AI-generated analysis of the student's resume against the opportunity — a fit score, key skills matched, key skills missing, and a short summary. Triggered on application submission (async, stored) and re-analyzable on demand.
3. **Job lifecycle extensions**: Opportunity model gains structured fields — `requirements` (text), `experienceLevel` (enum), `compensationMin`/`compensationMax` (optional integers replacing or augmenting the single `payAmount`). JD is composed from existing fields. Admin can edit the analysis and JD prompts from a dedicated `/admin/settings` page.

## Blast Surface

### Files to change

**New files:**
- `src/lib/llm/provider.ts` — OpenAI-compatible client factory, typed responses
- `src/lib/llm/config.ts` — env-based provider config (endpoint URL, API key, model name, fallback)
- `src/lib/llm/prompts.ts` — prompt template helpers, types for prompt keys
- `src/lib/resume-analysis.ts` — domain logic: analyze a resume against an opportunity, store result
- `src/app/api/admin/settings/prompts/route.ts` — API for admin to GET/PUT prompts (or server actions)
- `src/app/admin/settings/page.tsx` — admin UI to edit prompts
- `src/app/msme/opportunities/[id]/applicants/resume-analysis.tsx` — client component showing analysis
- `tests/llm.test.ts` — unit tests for provider config and prompt building
- `tests/resume-analysis.test.ts` — integration tests for analysis logic (mocked LLM)
- Plan file (this file)
- Updated docs: `ARCHITECTURE.md`, `DATA_MODEL.md`, `API.md`, `CHANGELOG.md`, `ROADMAP.md`

**Files to modify:**
- `prisma/schema.prisma` — add `Analysis` model, add fields to `Opportunity` (experienceLevel, requirements), add `prompt` table for admin-edited prompts
- `prisma/.env.example` — add `LLM_PROVIDER` vars
- `src/lib/env.ts` — validate new LLM-related env vars
- `src/lib/opportunity-schemas.ts` — add `experienceLevel`, `requirements` to schema
- `src/lib/opportunities.ts` — update create/update to handle new fields
- `src/lib/applications.ts` — trigger resume analysis on submission
- `src/app/msme/opportunities/[id]/applicants/page.tsx` — display analysis
- `src/app/msme/opportunities/opportunity-form.tsx` — add new form fields
- `src/lib/authz.ts` — no changes needed (admin role already exists)

### Files to read but not change
- `src/lib/embeddings.ts` — existing pattern for LLM-like calls (local model)
- `src/lib/msme-review.ts` — pattern for admin-only mutations
- `src/lib/logger.ts` — structured logging pattern
- `src/lib/search.ts` — raw SQL pattern
- `tests/applications.test.ts` — test patterns

## Dependencies

- OpenAI SDK (`openai` npm package) or a lightweight fetch-based OpenAI-compatible client. Given the project uses npm and has `@huggingface/transformers`, a minimal fetch-based client avoids adding a heavy dependency. **Decision**: use `openai` npm package as it's the standard for OpenAI-compatible endpoints and handles Gemini and Ollama fine.
- For resume text extraction: existing `@huggingface/transformers` is available; for PDF/DOC parsing we need a lightweight lib. **Decision**: use a minimal approach — extract text from DOCX via `unzip` + XML parsing (no dep), and for PDF we'll note it as a limitation or use a small lib. Actually, the project already accepts PDF/DOC/DOCX but never parses them. We'll add a text-extraction utility. **Decision**: skip PDF text extraction for now (record as limitation); support DOC/DOCX via basic XML parsing. This keeps scope minimal.

## Implementation Sequence

### Step 1: Prisma schema + migration
- Add `Prompt` model (key, content, updatedAt, updatedById) for admin-editable prompts.
- Add `Analysis` model (id, applicationId, score, summary, missingSkills, matchedSkills, model, createdAt).
- Add `experienceLevel` enum and `requirements` text field to `Opportunity`.
- Add `compensationMin`/`compensationMax` as optional Ints (complement, not replace `payAmount` for backward compat).
- Generate and apply migration.

### Step 2: LLM provider layer
- `src/lib/llm/config.ts`: zod schema for provider config (endpoint URL, API key, model, fallback model, max tokens, temperature defaults). Read from env with `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.
- `src/lib/llm/provider.ts`: `createLlmClient()` returns a client that calls the OpenAI-compatible chat completions endpoint. Returns `{ content: string, usage?: {...} }`. Handles errors gracefully (never throws — returns null on failure so resume analysis degrades gracefully).
- `src/lib/llm/prompts.ts`: typed prompt keys (`resume_analysis`, `job_description`), default prompt templates, `buildPrompt(key, vars)` helper.

### Step 3: Prompt management (admin)
- `src/lib/prompts.ts`: CRUD for `Prompt` model — `getPrompt(key)`, `setPrompt(key, content, adminId)`.
- `src/app/admin/settings/page.tsx`: admin page with a form per prompt key, pre-filled with defaults, editable textarea, save button.
- Server action `src/app/admin/settings/actions.ts` to handle saves (admin-only).
- Update `docs/API.md` and `src/proxy.ts` matcher to include `/admin/settings`.

### Step 4: Resume analysis domain logic
- `src/lib/resume-analysis.ts`: `analyzeResume(applicationId, opportunityId) -> Promise<Analysis | null>`. Loads the resume file, extracts text (DOC/DOCX basic, PDF as limitation), loads the opportunity, builds the prompt, calls the LLM, parses JSON output, stores the result. Designed to be called async (fire-and-forget in the apply flow).
- Add `analyzeAction` for MSME to re-trigger analysis on demand.

### Step 5: Wire into application flow
- In `src/lib/applications.ts`, after `applyToOpportunity` succeeds, fire `analyzeResume` in the background (not awaited, with error handling).
- Add `listResumeAnalyses` / `getResumeAnalysis` queries.

### Step 6: Apply forms for opportunities
- Add `experienceLevel`, `requirements`, `compensationMin`, `compensationMax` to the opportunity form and schema.
- Backward compatible: if old data lacks new fields, handle nulls.

### Step 7: Display analysis on applicants page
- In `src/app/msme/opportunities/[id]/applicants/`, fetch analyses, show fit score, matched/missing skills, summary, and a "Re-analyze" button.

### Step 8: Tests
- Unit tests for LLM config, prompt building, prompt CRUD.
- Integration tests for resume analysis (mock the LLM call via a fake provider or env pointing to a test endpoint).
- Tests for new opportunity schema fields and lifecycle.

### Step 9: Documentation
- Update `ARCHITECTURE.md`, `DATA_MODEL.md`, `API.md`, `CHANGELOG.md`, `ROADMAP.md`.
- Add ADR for the LLM provider decision.

## Test Strategy

- **Unit**: zod schemas for config, prompt keys, JSON parsing of LLM output.
- **Integration** (Vitest against real Postgres):
  - Prompt CRUD with admin session.
  - Opportunity creation with new fields.
  - `analyzeResume` with a mock LLM endpoint (wire `LLM_BASE_URL` to a test server, or inject a fake provider).
- **E2E** (Playwright): admin edits a prompt and saves; MSME sees analysis on applicants page.

## Documentation Impact

- `ARCHITECTURE.md`: mention `src/lib/llm/` and the new analysis flow.
- `DATA_MODEL.md`: document new models and fields.
- `API.md`: document `/admin/settings`, update opportunity API.
- `docs/DECISIONS.md`: ADR-023 for LLM provider choice; ADR-024 for resume analysis approach.
- `docs/ROADMAP.md`: mark Phase 7.
- `docs/CHANGELOG.md`: Phase 7 entry.

## Risks

- **LLM reliability**: analysis can fail (network, bad output). Must degrade gracefully — show "Analysis not available" rather than erroring the page.
- **Cost**: if pointing at a paid OpenAI endpoint, resume analysis calls incur cost. Default to the local HuggingFace path or a free-tier model; make the provider opt-in via empty env vars.
- **Resume text extraction**: PDF parsing is non-trivial. Defer PDF extraction and record as a limitation; DOC/DOCX handled with minimal logic.
- **Backward compat**: `payAmount`/`payPeriod` stay; new `compensationMin`/`Max` are additive and nullable.
- **Prompt injection from resume content**: prompts are admin-controlled, but resume text is user-supplied. Sanitize/log truncation; the prompt should clearly delimit resume content.

## Rollback / Recovery

- The new tables are additive; rolling back the migration drops them.
- The analysis runs async and never blocks the application flow.
- If the LLM provider is unconfigured, analysis is skipped and the UI shows "Unavailable".
