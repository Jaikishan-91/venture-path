# Blockers

Open Blockers:
- B-002 (2026-09-25): No Git remote configured. Commits are local only until a remote is added.
- B-003 (2026-09-25): Google sign-in needs a Google OAuth client ID and secret (Google Cloud Console), with redirect URI `http://localhost:3000/api/auth/callback/google` for local dev. Google sign-in is built but disabled and untested until these are set in `.env`. Resolve R-001 below before enabling it.

Deferred:
- B-001 (2026-09-25): `/graphify` skill. Deferred by the user on 2026-09-25 ("ignore graphify for now"). Skill files now exist untracked in `.agents/skills/graphify/` (not added by the agent, not committed).

Known Risks (must fix before the related feature ships):
- R-001 (2026-09-25): Pre-registration takeover via Google linking. Better Auth links a Google sign-in to an existing user with the same email when Google reports the email verified (implicit linking is on by default), and linking does not change `emailVerified`. Someone could sign up with another person's email and a password and role of their choosing; if that person later uses Google, both sign-in methods share one account. Fix before enabling Google (B-003): e.g. on Google link to an unverified user, mark the email verified and remove the unverified password credential and role, or set `accountLinking.disableImplicitLinking`.

Known Limitations (not blocking):
- Logs still in pino-loki's 2-second batch are lost if the process exits first (e.g. when Playwright stops the dev server). Stdout receives every line. See ADR-011.
- The Loki container has no Docker healthcheck because its image has no shell; readiness is at http://localhost:3100/ready.
- `next dev` listens on all network interfaces by default (the app is reachable from the local network). The Docker services are bound to 127.0.0.1.
- Better Auth's built-in rate limiting is on in production only; locally, sign-in and resend-verification endpoints are not rate limited.
- No password reset yet (not in the Phase 1 plan).
- An invalid or expired verification link redirects to `/dashboard`, which sends signed-out users to `/sign-in` without explaining why.

Resolved Blockers:
