# Blockers

Open Blockers:
- B-002 (2026-09-25): No Git remote configured. Commits are local only until a remote is added.
Deferred:
- B-001 (2026-09-25): `/graphify` skill. Deferred by the user on 2026-09-25 ("ignore graphify for now"). Skill files now exist untracked in `.agents/skills/graphify/` (not added by the agent, not committed).

Known Limitations (not blocking):
- Google Calendar / Meet (ADR-035) is not configured locally: it needs the Calendar API enabled, the `calendar.events` scope and `http://localhost:53682/oauth2callback` on the OAuth client, and `GOOGLE_CALENDAR_REFRESH_TOKEN` from `npm run google:calendar-token`. Until then scheduling works without Meet links. Only stubbed Google responses are tested; a live event has not been created. In "Testing" publishing status the token expires after 7 days; publish the app "In production" (unverified: one-time warning, 100-user cap). Consumer Gmail's daily invitation limits are not confirmed from a Google source.
- Hiring pipeline suggestions (`pipeline_suggest`) are tested with stubbed LLM replies only.
- Logs still in pino-loki's 2-second batch are lost if the process exits first (e.g. when Playwright stops the dev server). Stdout receives every line. See ADR-011.
- The Loki container has no Docker healthcheck because its image has no shell; readiness is at http://localhost:3100/ready.
- `next dev` listens on all network interfaces by default (the app is reachable from the local network). The Docker services are bound to 127.0.0.1.
- Better Auth's built-in rate limiting is on in production only; locally, sign-in and resend-verification endpoints are not rate limited.
- No password reset yet (not in the Phase 1 plan). Consequence: if someone signs up with another person's email and never verifies it, the real owner can't use Google with that email (Better Auth refuses to link to an unverified local account) and can't sign up again. The squatter still can't sign in. Password reset will give the owner a way back.
- Google OAuth client is for local development only (origin and redirect URI `http://localhost:3000`). The downloaded `client_secret_*.json` in the repo root is git-ignored; its values are copied into `.env`, so the file can be deleted.
- Resume analysis needs `LLM_PROVIDER=openai` and a reachable endpoint; the tests use a stubbed `fetch`, so a real model has not been exercised by the test suite. Scanned (image-only) PDFs have no text and can't be analysed. Legacy DOC extraction is a rough scan of printable text.
- Screening (ADR-031 to ADR-033) makes 1–2 LLM calls per listing created, resume uploaded and application sent. There is no rate limit: a user can upload, delete and re-upload to repeat skill extraction. Only stubbed LLM replies are tested; the prompts have not been tuned against a real model.
- Recommendation weights (0.7 coverage, 0.3 similarity) and the 0.25 threshold are heuristics tuned on test data. The skill alias map is small.
- Question lock: an application created in the same instant as a question edit can be refused ("questions changed", reload) rather than locking the edit; no answers are ever attached to a deleted question.
- Resolved 2026-09-26: the local `.env` had `LLM_PROVIDER=enabled` (invalid, so AI was silently off), the base URL `https://ollama.com/api` (not OpenAI-compatible), and the model `deepseek-v4-flash:0731` (retired by Ollama Cloud, HTTP 410). It now uses `openai`, `https://ollama.com/v1` and `gemma4:31b` (ADR-034); a live call through `createLlmClient` returned a parseable analysis. Only 6 of the key's 17 models are in the free plan; the rest return HTTP 402 until usage credits are added.
- `LLM_FALLBACK_MODEL` is read but not used. The `job_description` prompt is editable but no feature uses it yet.
- Running the whole Playwright suite in parallel on a cold dev server can time out (route compilation plus the embedding model load). Every spec passes when re-run, or with `--workers=1`.
- An invalid or expired verification link redirects to `/dashboard`, which sends signed-out users to `/sign-in` without explaining why.

Resolved Blockers:
- B-003 (resolved 2026-09-25): Google OAuth client provided (Web application, origin `http://localhost:3000`, redirect `http://localhost:3000/api/auth/callback/google`). Values set in `.env`; Google sign-in enabled.
- R-001 (closed 2026-09-25, not a risk): the suspected takeover via Google linking to an unverified account. Better Auth 1.7.6 `handleOAuthUserInfo` refuses implicit linking when the local email is unverified (`accountLinking.requireLocalEmailVerified`, default true), returning "account not linked". Checked in `node_modules/better-auth/dist/oauth2/link-account.mjs`. Keep that option at its default.
