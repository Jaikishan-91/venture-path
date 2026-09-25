# Blockers

Open Blockers:
- B-002 (2026-09-25): No Git remote configured. Commits are local only until a remote is added.
Deferred:
- B-001 (2026-09-25): `/graphify` skill. Deferred by the user on 2026-09-25 ("ignore graphify for now"). Skill files now exist untracked in `.agents/skills/graphify/` (not added by the agent, not committed).

Known Limitations (not blocking):
- Logs still in pino-loki's 2-second batch are lost if the process exits first (e.g. when Playwright stops the dev server). Stdout receives every line. See ADR-011.
- The Loki container has no Docker healthcheck because its image has no shell; readiness is at http://localhost:3100/ready.
- `next dev` listens on all network interfaces by default (the app is reachable from the local network). The Docker services are bound to 127.0.0.1.
- Better Auth's built-in rate limiting is on in production only; locally, sign-in and resend-verification endpoints are not rate limited.
- No password reset yet (not in the Phase 1 plan). Consequence: if someone signs up with another person's email and never verifies it, the real owner can't use Google with that email (Better Auth refuses to link to an unverified local account) and can't sign up again. The squatter still can't sign in. Password reset will give the owner a way back.
- Google OAuth client is for local development only (origin and redirect URI `http://localhost:3000`). The downloaded `client_secret_*.json` in the repo root is git-ignored; its values are copied into `.env`, so the file can be deleted.
- An invalid or expired verification link redirects to `/dashboard`, which sends signed-out users to `/sign-in` without explaining why.

Resolved Blockers:
- B-003 (resolved 2026-09-25): Google OAuth client provided (Web application, origin `http://localhost:3000`, redirect `http://localhost:3000/api/auth/callback/google`). Values set in `.env`; Google sign-in enabled.
- R-001 (closed 2026-09-25, not a risk): the suspected takeover via Google linking to an unverified account. Better Auth 1.7.6 `handleOAuthUserInfo` refuses implicit linking when the local email is unverified (`accountLinking.requireLocalEmailVerified`, default true), returning "account not linked". Checked in `node_modules/better-auth/dist/oauth2/link-account.mjs`. Keep that option at its default.
