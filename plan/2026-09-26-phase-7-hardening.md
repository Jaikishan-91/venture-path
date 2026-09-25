# Implementation Plan — Phase 7 hardening (resume analysis)

Status: shipped
Parent plan: `plan/2026-09-25-phase-7-openai-resume-analysis.md` (committed in `d4fd7bb`, never marked shipped)

## Objective

Make the Phase 7 resume analysis actually work and meet the project's completion standard: fix the defects found in review, add the missing tests, and bring the docs in line with the code.

## Current state (found 2026-09-26)

Defects:
1. `analysis.applicationId` is unique, but `analyzeResume` always `create`s. Re-analyze, and analysis after a withdraw-and-reapply, fail with a unique-constraint error.
2. `reanalyzeAction` doesn't check that the MSME owns the application. Any MSME can trigger (paid) analysis of any application ID.
3. `decideAction` now redirects to `/msme/opportunities` instead of revalidating. The MSME leaves the applicants page, and `e2e/applications.spec.ts` (expects the email in the same card after Accept) breaks. Phase 6 behavior was revalidate-in-place.
4. `getLlmConfig()` throws on an invalid `LLM_PROVIDER` (the local `.env` has `enabled`), and the applicants page calls it while rendering, so the page 500s. The provider doc comment promises null when misconfigured.
5. PDF resumes are never analyzed (returns null). The user's Phase 7 decision was to include PDF extraction with `pdf-parse`. The upload form mostly receives PDFs.
6. `extractPlainTextFromBinary` regex lacks the `g` flag, so it returns only the first run of text.
7. The LLM may return a non-integer score (e.g. 72.5); `Analysis.score` is `Int`, so the insert throws.
8. The migration's seed prompts use `'\n'` in standard SQL strings. Postgres stores a literal backslash-n, so the stored prompts show `\n` in the admin editor and the LLM prompt.
9. Resume text isn't delimited from instructions (prompt-injection risk noted in the Phase 7 plan).
10. `updatePrompt` fails with "Prompt not found" if the row is missing (e.g. DB created without the seed rows); `getAllPrompts` shows the default, so saving it fails.
11. The "Analyze now" form doesn't show errors or pass `opportunityId`.

Missing: no tests for Phase 7 (plan listed `tests/llm.test.ts`, `tests/resume-analysis.test.ts`). No ADRs. `ARCHITECTURE.md`, `DATA_MODEL.md`, `API.md`, `ROADMAP.md`, `PROJECT.md` don't mention Phase 7. The changelog describes env vars and functions that don't exist (`OPENAI_API_KEY`, `analyzeApplication`, azure/anthropic). The plan isn't in `plan/README.md`.

## Desired state

- Analysis is upserted (one row per application; re-analyze replaces it).
- Re-analyze is scoped to the MSME's own applications.
- Accept/reject stays on the applicants page (Phase 6 behavior).
- An invalid LLM config logs a warning and counts as disabled; it never breaks a page.
- PDF, DOCX and DOC text extraction works; score is rounded and clamped to 0–100 (integer).
- A new migration fixes the literal `\n` in unedited seed prompts.
- Resume text is wrapped in clear delimiters, with a system message telling the model to treat it as data.
- Saving a prompt upserts.
- Tests cover: config parsing, prompt building, output parsing, text extraction, analysis upsert and ownership (mocked `fetch`).
- Docs updated; ADR-023 (LLM provider) and ADR-024 (resume analysis) recorded.

## Blast surface

Change: `src/lib/llm/config.ts`, `src/lib/llm/provider.ts` (minor), `src/lib/resume-analysis.ts`, `src/lib/prompts.ts`, `src/lib/llm/defaults.ts`, `src/app/msme/opportunities/[id]/applicants/actions.ts`, `.../resume-analysis.tsx`, new migration, `package.json` (+ `pdf-parse`), `next.config.ts` (if `pdf-parse` must be a server external), `Dockerfile` (if the standalone trace misses it), new `tests/llm.test.ts`, `tests/resume-analysis.test.ts`, docs.

Read only: `src/lib/applications.ts`, `src/lib/resumes.ts`, `prisma/schema.prisma`, `e2e/applications.spec.ts`.

No schema change (only a data migration).

## Sequence

1. Baseline: install, start Docker, run typecheck, lint, vitest.
2. Config/provider robustness (4).
3. Resume analysis: upsert (1), text extraction incl. PDF (5, 6), score (7), delimiters (9), ownership-scoped entry point for the action (2).
4. Actions/UI (2, 3, 11); prompt upsert (10).
5. Data migration (8).
6. Tests; run typecheck, lint, vitest, then Playwright applications/browse specs.
7. Docs, plan index, commit.

## Test strategy

Unit: config (disabled, openai, invalid → disabled), `buildPrompt`, `parseAnalysisOutput` (fenced JSON, float score, out of range). Integration against Postgres: analyze with a stubbed `fetch` creates then replaces the row; a foreign MSME can't reanalyze; DOCX and PDF extraction from generated fixtures. E2E: existing `applications.spec.ts` must pass again.

## Risks

- `pdf-parse` in Next's server bundle/standalone output — verify with `next build`.
- Real LLM calls are not exercised by tests (stubbed); a manual check needs a valid key.

## Rollback

Revert the commit. The data migration only rewrites unedited seed prompt text.

## Additional defects found during implementation

12. `requirements`/`experienceLevel` had no default in `opportunitySchema`; 14 existing unit tests failed.
13. `import "server-only"` made `applications.ts` unloadable in Vitest.
14. The DOCX ZIP reader read local-header name/extra lengths at offsets 28/30 instead of 26/28.

## Deviation

PDF parsing uses `unpdf` instead of `pdf-parse`: `pdf-parse` 2.4.5 depends on the native `@napi-rs/canvas`, while `unpdf` 1.8.1 has no required dependencies (ADR-024).

## Verification (2026-09-26)

Environment: Postgres on 127.0.0.1:55432 (port 5432 is used by another project's container; `DATABASE_URL` overridden in the shell), Mailpit, Loki.

- `npm run typecheck`: pass. `npm run lint`: pass (0 problems).
- `npm test`: 16 files, 155 tests pass (run twice).
- `npm run build`: pass.
- `npx playwright test`: all 25 tests passed across runs. In the full parallel run, 6 timed out on the cold dev server; the same specs passed on re-run (applications) and with `--workers=1` (admin-review, browse, opportunities).
- `docker compose build next`: pass (image 423 MB); `unpdf` is bundled into `.next/server` chunks.
- Not verified: a real LLM call (tests stub `fetch`), and PDF extraction exercised inside the running production server.

