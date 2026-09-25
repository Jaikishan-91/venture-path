# AI Engineering Operating System

This repository uses a five-pillar engineering lifecycle for AI-assisted development.

## The Five Pillars

1. **PLAN / DISCOVER** — understand the request, inspect the repository, map the blast surface, research when necessary, and produce a concrete plan before changing code.
2. **IMPLEMENT** — execute the approved plan with minimal, scoped, maintainable changes.
3. **TEST / VERIFY** — create/update appropriate tests and actually run relevant validation.
4. **REVIEW / HARDEN** — review the implementation against requirements, architecture, security, performance, maintainability, and regression risk.
5. **DOCUMENT / CLOSE** — update the project's persistent documentation and record what changed, what was verified, and what remains.

A meaningful change is not complete until all applicable pillars are satisfied.

## Core Rules

- Understand before modifying.
- Plan before implementing non-trivial work.
- Never claim verification that was not performed.
- Never invent requirements, API capabilities, test results, or project state.
- Do not silently expand scope.
- Do not perform unrelated refactors.
- Prefer existing project patterns over introducing new abstractions.
- Keep changes minimal while maintaining correctness.
- If implementation reveals that the plan is materially wrong, stop and re-plan.
- Preserve backward compatibility unless the requirement explicitly changes it.
- Treat security, data integrity, and destructive operations as first-class concerns.
- Ask the user only when the answer cannot reasonably be determined from the repository, documentation, or authoritative sources.

## Context and Token Discipline

Use progressive disclosure.

Default reading order:
1. This file.
2. `AGENTS.md`.
3. The workflow document relevant to the current pillar.
4. Project documentation relevant to the task.
5. Only then, the source files required to understand the blast surface.

Do not read the entire repository by default.

Before opening many files:
- inspect the repository tree;
- identify likely entry points;
- identify dependency boundaries;
- search for symbols, routes, models, components, tests, and configuration related to the task;
- then read the relevant files in sufficient context.

Do not repeatedly restate information already present in project documentation.

When communicating:
- use `/caveman` for ultra-low-token status;
- use `/grill-me` when requirements or decisions need interrogation;
- otherwise communicate only what is useful for the current task.

## Source of Truth

Use the most specific authoritative source available:

1. Explicit user requirements and decisions.
2. Current source code and executable configuration.
3. Current tests and observed behavior.
4. Project documentation.
5. Authoritative external documentation/research.
6. Agent assumptions.

If sources conflict, do not silently choose. Surface the conflict and resolve it or document the chosen decision.

## Change Scope

Before editing, identify:
- requested behavior;
- current behavior;
- affected files/modules;
- upstream and downstream dependencies;
- data/API/infrastructure impact;
- tests affected;
- documentation affected.

Avoid changing files outside the identified surface unless the implementation genuinely requires it.

## External Research

When a task depends on current library, API, framework, pricing, quota, security, or platform behavior:
- verify against authoritative/current sources where available;
- do not fabricate capabilities or limits;
- record material decisions in `docs/DECISIONS.md`.

## Completion Standard

A task is complete only when:
- the requested behavior is implemented;
- relevant tests/validation have actually been run;
- material review findings are resolved or documented;
- affected documentation is updated;
- known limitations/blockers are recorded;
- the final response states what changed and what was actually verified.

## Project-Specific Configuration

Project-specific facts belong in `docs/`, not here.

At minimum, initialize:
- `docs/PROJECT.md`
- `docs/REQUIREMENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/CONSTRAINTS.md`
- `docs/DECISIONS.md`
- `docs/BLOCKERS.md`
- `docs/CHANGELOG.md`
- `docs/ROADMAP.md`

Add `DATA_MODEL.md` and `API.md` when applicable.
