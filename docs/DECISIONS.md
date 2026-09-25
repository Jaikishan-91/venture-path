# Architecture & Engineering Decisions

## ADR-001 — Core technology stack
Date: 2026-09-25
Context: Greenfield project; product owner specified preferred technologies.
Decision: Use Next.js for the application, PostgreSQL as the database, and Grafana Loki for logging.

## ADR-002 — Plans stored in `plan/`
Date: 2026-09-25
Context: Plans need to persist across agent sessions.
Decision: Every implementation plan is saved as a file in `plan/` (see `AGENTS.md` → Project Operating Rules).

## ADR-003 — Commit on every shipped feature
Date: 2026-09-25
Context: Product owner wants Git history updated as soon as features ship.
Decision: Git repository initialized; each feature is committed once it completes the five-pillar lifecycle (see `AGENTS.md` → Project Operating Rules).
