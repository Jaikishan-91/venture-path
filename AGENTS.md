# Agent Operating Manual

This file defines how AI coding agents operate in this repository. `CLAUDE.md` contains the governing principles; this file contains the execution procedure.

## Mandatory Lifecycle

Every non-trivial change follows:

PLAN → IMPLEMENT → TEST → REVIEW → DOCUMENT

Do not skip a pillar merely because the change appears small. For genuinely trivial changes, use judgment and record why a reduced workflow was appropriate.

---

# PILLAR 1 — PLAN / DISCOVER

Before modifying code:

1. Restate the objective internally in concrete engineering terms.
2. Inspect the repository structure.
3. Read `CLAUDE.md`.
4. Read the relevant project docs.
5. Locate the feature/module entry points.
6. Search for all important references.
7. Map the **blast surface**:
   - files;
   - modules;
   - APIs;
   - database/schema;
   - configuration;
   - background jobs;
   - external integrations;
   - tests;
   - documentation.
8. Read the relevant files, not merely search snippets.
9. Identify existing patterns and reusable utilities.
10. Identify constraints and risks.
11. Research external behavior when required.
12. Compare viable implementation approaches.
13. Select the simplest approach that satisfies the requirements.
14. Produce a concrete plan.

### Plan must include

- objective;
- current state;
- desired state;
- blast surface;
- files expected to change;
- files expected to be read but not changed;
- dependencies;
- implementation sequence;
- test strategy;
- documentation impact;
- risks;
- rollback/recovery considerations where relevant.

### Planning gate

No code changes until the plan is sufficiently concrete.

If important requirements are ambiguous, use `/grill-me`.

---

# PILLAR 2 — IMPLEMENT

1. Follow the approved plan.
2. Work in dependency order.
3. Preserve existing conventions.
4. Reuse existing code where appropriate.
5. Keep changes scoped.
6. Avoid opportunistic refactoring.
7. Do not silently change requirements.
8. Do not add unnecessary dependencies.
9. Keep security and error handling explicit.
10. Keep changes reviewable.

### Plan deviation

If implementation reveals a material flaw in the plan:

STOP → explain the discovery → update/re-run planning → continue only with the corrected plan.

Do not silently improvise a materially different architecture.

---

# PILLAR 3 — TEST / VERIFY

After implementation:

1. Determine what behavior changed.
2. Determine what could regress.
3. Add or update appropriate tests.
4. Run targeted tests first.
5. Run broader tests when appropriate.
6. Run lint/type checks/builds where applicable.
7. Exercise integration boundaries when applicable.
8. Verify failure and edge cases that matter.

Record:
- command;
- result;
- failures;
- environment limitations;
- unverified areas.

Never say "tests pass" unless the tests were actually executed.

---

# PILLAR 4 — REVIEW / HARDEN

Review the final diff against:

- original requirements;
- approved plan;
- architecture;
- security;
- data integrity;
- API compatibility;
- error handling;
- edge cases;
- performance;
- maintainability;
- duplication;
- dependency changes;
- observability;
- regression risk.

Fix material findings.

After fixes, re-run the affected tests.

---

# PILLAR 5 — DOCUMENT / CLOSE

Update only the documentation affected by the change.

The final record should answer:
- What changed?
- Why?
- Which files changed?
- What was tested?
- What was not tested?
- What limitations remain?
- Is follow-up work required?

---

# PROJECT OPERATING RULES (VenturePath)

These rules are permanent and apply to every session.

## Plans live in `plan/`

- Every plan produced in Pillar 1 is saved to `plan/` before implementation starts.
- File name: `plan/YYYY-MM-DD-<short-slug>.md`, based on `templates/PLAN.md`.
- Each plan has a `Status:` line (`draft` | `approved` | `in-progress` | `shipped` | `abandoned`); update it as work progresses.
- Never delete old plans; if a plan is replaced, mark it `abandoned` and link to the new one.
- Add every plan to the index in `plan/README.md`.

## Commit to Git whenever a feature ships

- A feature has shipped when all five pillars are complete for it.
- Commit right away, with a Conventional Commits message (e.g. `feat: add internship posting`), covering the code, tests, docs and the plan status update.
- Never commit secrets (`.env*`, credentials, keys).
- Push if a remote is configured; otherwise commit locally (see `docs/BLOCKERS.md`).
- Do not rewrite history (force-push, rebase of pushed commits) without explicit user approval.

## Skills

- `/grill-me` — use it during Pillar 1 whenever requirements are ambiguous; ask one highest-value question at a time.
- `/graphify` — requested by the product owner but not yet defined (see `docs/BLOCKERS.md` B-001). Do not invent its behavior.

## Project facts

Stack, requirements and architecture live in `docs/` (`PROJECT.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DECISIONS.md`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
