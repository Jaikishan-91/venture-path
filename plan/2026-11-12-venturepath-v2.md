# VenturePath v2 — Challenges, Proof cards, AI interviewer

Status: in-progress
Date: 2026-11-12

## Objective

Build the product in `docs/PRODUCT.md` (approved by the user 2026-11-12, product renamed from Pramaan to VenturePath): business challenges with money/hire rewards (Modules 1–2), proof cards instead of resume-only (Modules 3–4), and an AI interviewer stage with chat and voice plus a report (Modules 5–6). Navigation, demo seed and polish are Module 7.

## User decisions

| # | Decision |
|---|----------|
| U1 | Keep the interface and process easy and simple (one form per action, plain labels). |
| U2 | Challenges: real business problem, best solution rewarded with money or hiring. |
| U3 | Proof-based talent instead of resume-only; three trust badges. |
| U4 | Direct hiring uses the existing pipeline plus an AI interviewer that interviews, screens and reports. |
| U5 | AI interviewer built from FoloUp (brain/prompts), aural-oss (chat + integrity), and only DeepInterview's LiveKit live part for voice. |
| U6 | Voice model: Gemini Live `gemini-3.8-live` with the user's Google key (in `.env`, never in docs). |
| U7 | Build module-wise with parallel agents for independent work. |

Defaults (docs/PRODUCT.md §11): money paid outside the app; 6 questions, ≤1 follow-up each, 3-day link, one attempt; transcripts only, never audio; at least one proof card or a resume to apply; 🔵 badge never scrapes links; hiring managers don't see AI reports.

## Module 0 — Foundation (this commit)

- One migration `venturepath_v2_challenges_proof_interview`: `Challenge`, `ChallengeSubmission`, `Proof`, `InterviewSession`, implicit `Application`↔`Proof`, `Opportunity.applyTask`, `StageKind.ai_interview`; `Application.resumeFileName/resumeStorageKey` now nullable (proof-only applications).
- Code that assumed a resume now handles none: resume route 404s, applicants/HM pages hide the download, resume analysis skips the resume part.
- `STAGE_KINDS` gains `ai_interview` and `UNSCHEDULED_STAGE_KINDS`.
- Shared contract `src/lib/v2/types.ts` (limits, JSON shapes, voice API contract, ownership rules).
- `src/lib/uploads.ts` for challenge/submission/proof files.
- Prompt keys registered (`challenge_assist`, `challenge_scoring`, `proof_check`, `interview_questions`, `interview_followup`, `interview_report`) with per-package default files in `src/lib/llm/defaults-v2/`.
- `scripts/llm-check.ts` (`npm run llm:check`): one live call through the app's LLM client.
- Environment: text LLM `gemini-3.5-flash` via Gemini's OpenAI-compatible endpoint; Docker Postgres host port configurable (`POSTGRES_HOST_PORT`, 5433 locally).

## Work packages (parallel, one git worktree/branch each)

| WP | Modules | Owns | Depends on |
|----|---------|------|------------|
| A Challenges | 1–2 | `src/lib/challenge*.ts`, `src/app/challenges/**`, `src/app/organisation/challenges/**`, challenge-sourced Proof writes, `defaults-v2/challenges.ts` | Module 0 |
| B Proof | 3–4 | `src/lib/proof*.ts`, `src/app/user/proof/**`, apply form + `applications.ts` proof attach, applicants page proof section, `defaults-v2/proofs.ts` | Module 0 |
| C AI interview | 5 (chat), 6 | `src/lib/ai-interview*.ts`, `src/app/interview/[token]/**`, report panel, `pipeline-progress.ts` hook, scheduling refusal for `ai_interview`, `pipeline_suggest` prompt, `defaults-v2/interview.ts` | Module 0 |
| D Voice | 5 (voice) | `voice-agent/` (Python), `src/app/api/voice-agent/**`, `src/app/api/interview/[token]/livekit-token`, `src/components/interview/voice-room.tsx`, docker-compose `livekit` + `voice-agent` | Contract in `src/lib/v2/types.ts`; C's exported functions (integrated at merge) |

Shared files (`app-sidebar.tsx`, dashboards, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`, `plan/README.md`) are edited only at merge (Module 7).

## Test strategy

Each WP adds Vitest tests (`tests/<area>.test.ts`, LLM stubbed via `fetch` like `tests/screening.test.ts`), runs `npm run typecheck`, `npm run lint`, and the full `npm test`. Known pre-existing failure: `tests/resumes.test.ts > strips a path from the display name` (backslash paths on macOS), recorded in `docs/BLOCKERS.md`. Module 7 runs the docs/PRODUCT.md §8 demo story end to end in the browser.

## Risks

- Gemini text latency ~5–11 s per plan generation (measured 2026-11-12); follow-ups need a visible "thinking" state. 3.7/3.8 Flash returned 503 "high demand" on 2026-11-12.
- Voice: realtime model drift (mitigated by one-question-at-a-time tool), Indian-accent recognition untested, Python sidecar + LiveKit setup. Checkpoint Day 3 16:00 → ship as beta behind `VOICE_INTERVIEW_ENABLED`.
- Merge conflicts in the few shared files (applicants page touched by B and C) — resolved at merge.

## Rollback

All new tables are additive. The only change to existing data is two columns becoming nullable (no data loss). Reverting the code leaves new tables unused.
