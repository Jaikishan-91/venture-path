# Blockers

Open Blockers:
- B-001 (2026-09-25): `/graphify` skill requested for use in this project, but no such skill or command exists in the repository or the Cursor skills directory. Needs a definition (what it does / source) before it can be used.
- B-002 (2026-09-25): No Git remote configured. Commits are local only until a remote is added.

- B-003 (2026-09-25): Phase 1 needs a Google OAuth client ID and secret (Google Cloud Console) for Google sign-in. Email/password work can start without it.

Known Limitations (not blocking):
- Logs still in pino-loki's 2-second batch are lost if the process exits first (e.g. when Playwright stops the dev server). Stdout receives every line. See ADR-011.
- The Loki container has no Docker healthcheck because its image has no shell; readiness is at http://localhost:3100/ready.
- `next dev` listens on all network interfaces by default (the app is reachable from the local network). The Docker services are bound to 127.0.0.1.

Resolved Blockers:
