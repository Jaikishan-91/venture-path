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

## ADR-004 — MVP boundary: discovery and application only
Date: 2026-09-25
Context: The platform could stop at matching or also handle messaging, contracts and payments; that choice drives data model, security and legal scope.
Decision: MVP covers profiles, opportunity posting, search, applying, and accept/reject. Messaging, contracts, payments and reviews are out of MVP scope.

## ADR-005 — Only MSMEs post listings in MVP
Date: 2026-09-25
Context: "Post and find" could mean both sides post listings.
Decision: In the MVP only MSMEs post opportunities (freelance or internship). Students have profiles and apply. Student service listings and a student directory are deferred.

## ADR-006 — Email verification plus admin approval of MSMEs
Date: 2026-09-25
Context: Fake or scam listings aimed at students are the main trust risk.
Decision: Every user verifies their email. An admin role approves each MSME, and an MSME's listings are not visible to students until approval.

## ADR-007 — Sign-in with email/password and Google
Date: 2026-09-25
Context: Need a sign-in method that is familiar to students and supports email verification.
Decision: Support email and password (with email verification) and Google sign-in. Auth library: Better Auth (ADR-009).

## ADR-008 — Local Docker Compose first; production hosting deferred
Date: 2026-09-25
Context: No production hosting decision yet; want no cost or lock-in during MVP build.
Decision: Develop locally with Docker Compose running Next.js, PostgreSQL, Loki and Grafana. Production hosting will be decided later and recorded as a new ADR.

## ADR-009 — Application technical stack
Date: 2026-09-25
Context: Remaining technical choices after ADR-001.
Decision: TypeScript, Next.js App Router, Prisma ORM (PostgreSQL, Prisma Migrate), Better Auth (email/password + Google), Tailwind CSS with shadcn/ui, pino for structured logging shipped to Loki, Vitest for unit/integration tests and Playwright for end-to-end tests. Package manager: npm.

## ADR-010 — Pin Prisma 7.10.0; override two vulnerable CLI dependencies
Date: 2026-09-25
Context: npm's `latest` tag for `prisma` is `8.0.0-rc.17`, but Better Auth 1.7.6 declares `prisma ^5 || ^6 || ^7`. The Prisma 7.10.0 CLI pulls in `deepmerge-ts` 7.x (GHSA-ggr8-5vv4-36mx) and a vulnerable `mysql2`; npm's suggested fix was downgrading to Prisma 6.
Decision: Pin `prisma`, `@prisma/client` and `@prisma/adapter-pg` to exactly 7.10.0. Add npm `overrides` for `mysql2 ^3.24.4` and `deepmerge-ts ^8.0.2`. Verified afterwards: `npm audit` reports 0 vulnerabilities, and `prisma validate` and `prisma generate` still work. Revisit when Better Auth supports Prisma 8.

## ADR-011 — Push logs directly to Loki with pino-loki
Date: 2026-09-25
Context: Logs could be shipped by an agent (Grafana Alloy/Promtail) or pushed by the app.
Decision: Use the `pino-loki` transport in a pino worker thread, with 2-second batching. No log agent is needed locally. Trade-off: logs buffered at shutdown or while Loki is unreachable can be lost; stdout still receives every line. Revisit for production hosting.

## ADR-012 — shadcn/ui default preset
Date: 2026-09-25
Context: shadcn/ui 4.21 offers several presets and component bases.
Decision: Use `shadcn init --defaults` (template `next`, preset `base-nova`, Base UI components). It installs the `cn` package (published by shadcn from `shadcn-ui/cn` with npm provenance) instead of `clsx` + `tailwind-merge`. `cn` is only weeks old; watch it for issues.

## ADR-013 — Role is server-owned, chosen once, never changed by users
Date: 2026-09-25
Context: Users pick student or MSME. Google sign-in has no role field. Letting clients write the role would allow self-promotion to admin (user decisions 1 and 2, Phase 1 plan).
Decision: `User.role` is a nullable enum declared to Better Auth with `input: false`, so no auth endpoint or OAuth profile can set it (Better Auth rejects it with 400). The only user-driven write is `assignInitialRole`: `student`/`msme` only, and only while the role is `null`. Email sign-up assigns it right after account creation; a user whose role is still `null` (e.g. first Google sign-in) is held on `/onboarding/role`. Admins are created only by the seed script. Changing a set role is admin-only and not built yet.

## ADR-014 — Email verification required before sign-in
Date: 2026-09-25
Context: ADR-006 requires verified emails; user decision 3 blocks unverified users entirely.
Decision: `requireEmailVerification: true`, `sendOnSignUp` and `sendOnSignIn` (a blocked sign-in re-sends the link), `autoSignInAfterVerification`. Sign-up returns the same "check your inbox" response for new and existing emails (no account enumeration). Email is sent without awaiting inside the Better Auth callback, as its docs advise. Local SMTP is Mailpit via nodemailer; production provider TBD.

## ADR-015 — Route protection in pages, proxy only as an optimisation
Date: 2026-09-25
Context: Next.js 16 renamed middleware to `proxy`. Better Auth docs say a cookie check there is not a security boundary.
Decision: `src/proxy.ts` redirects requests without a session cookie on protected paths. Every protected page and server action calls `requireSession`/`requireRole`, which validate the session against the database. Wrong-role users are redirected to their own home rather than shown a 403.

## ADR-016 — Optional profiles; MSME approval resets on change
Date: 2026-09-25
Context: Phase 2 adds student and MSME profiles and the MSME approval status (user decisions, Phase 2 plan).
Decision: Profiles are optional; dashboards prompt for one, and later phases require it where needed. `MsmeProfile.status` is server-owned: a new profile is `pending`; saving a changed `approved` profile returns it to `pending` (its listings will be hidden until re-approved); saving a `rejected` profile resubmits it as `pending`. The save updates conditionally on the status it read, so a concurrent admin decision is never overwritten. Skills are free-form tags, lowercased and de-duplicated. Profile links and websites must be `http`/`https` URLs. The student's name stays on `User.name`. Review metadata (reviewer, time, reason) is left to Phase 3.

## ADR-017 — nodemon only for changes Next.js can't hot-reload
Date: 2026-09-25
Context: The user wants UI and backend changes visible live. Next.js already hot-reloads everything in `src/`, but the Prisma client, the Better Auth instance and parsed env are cached per process, so schema and `.env` changes needed a manual restart (seen after the Phase 2 migration).
Decision: `npm run dev` wraps `prisma generate && next dev` in nodemon, watching only `prisma/schema.prisma`, `prisma7.config.ts` and `.env`. `src/` is not watched by nodemon: restarting on every save would be slower and lose Fast Refresh state.

## ADR-018 — Generic SMTP with login; test domains stay on the mail catcher
Date: 2026-09-25
Context: The user wants real email and chose Gmail SMTP (`smtp.gmail.com`). E2E tests sign up `@e2e.venturepath.local` users and read verification links from Mailpit, and only one `next dev` can run per project, so tests and manual use share one mail configuration.
Decision: `src/lib/email.ts` stays provider-agnostic nodemailer SMTP, with optional `SMTP_USER`/`SMTP_PASSWORD` and TLS (`secure` on 465, `requireTLS` otherwise when logging in). Outside production, recipients on RFC 2606/6761 reserved domains (`.local`, `.test`, `.example`, `.invalid`) are sent to `MAIL_CATCHER_URL` (Mailpit), since they can never be delivered. Gmail limits: personal accounts send roughly 500 messages a day and Gmail rewrites the From header to the authenticated account unless it is a verified alias, so this is for development, not production. Production provider remains TBD.

## ADR-019 — Admin MSME review: any status, reason required, stale-safe
Date: 2026-09-25
Context: Phase 3 user decisions: email the MSME on each decision, admins can decide from any status, list all MSMEs by status, rejection reason required.
Decision: `reviewMsme` sets `status`, `reviewedById`, `reviewedAt` and `rejectionReason` (cleared on approval) with one conditional update: `updatedAt` must equal the value rendered on the admin page and the status must change. An MSME edit made after the page loaded, a second admin's decision, or a double submit is refused with "changed, review again", so admins never approve content they haven't seen. The decision email is sent after the update without awaiting; a failed email is logged and doesn't undo the decision. The review fields describe the last decision and are kept when an edit resets the status to `pending`.

## ADR-020 — Listings: approval-gated writes, reversible close, India-time deadlines
Date: 2026-09-25
Context: Phase 4 user decisions on pay, location, who can list, revoked MSMEs, lifecycle and deadlines.
Decision: `Opportunity` stores structured pay (`payType`; `payAmount` whole INR and `payPeriod` only when paid; unpaid only for internships) and `workMode` with a city required unless remote. Only approved MSMEs create, edit, publish or reopen; closing and deleting drafts are always allowed because they only reduce exposure. Lifecycle draft → published ⇄ closed; only drafts are deleted. Listings of an MSME that loses approval keep their status and are hidden by the Phase 5 visibility rule (published + approved MSME + deadline not passed). Deadlines are dates (last day to apply) compared with today in Asia/Kolkata; saving a past deadline and publishing/reopening after it has passed are refused. All writes are scoped to the session user's MSME profile, and status changes are conditional on the expected current status.
## ADR-021 — Public browse with local embeddings and pgvector
Date: 2026-09-25
Context: Phase 5 user decisions: anyone can browse, city dropdown of current listings, semantic search, a detail page, a type filter, newest first when there is no query. The user chose pgvector with a local model and hybrid keyword ranking.
Decision: Postgres runs as `pgvector/pgvector:0.8.6-pg18-trixie`. Listing text (title, type, skills, description) is embedded with Transformers.js `onnx-community/all-MiniLM-L6-v2-ONNX` (384 dimensions, mean pooling, normalised) and stored in `opportunity.embedding` with an HNSW cosine index. The model downloads once into `.cache/models`. A failed embedding does not fail the save; `npm run embeddings:backfill` repairs it. A query ranks by cosine similarity plus a keyword bonus (title 0.3, skills 0.25, business name 0.2, description 0.1); a result must score at least 0.3 similarity or have a keyword match. Without a query, results are newest published first. Every public query also enforces the visibility rule. The detail page shows the business profile but never the owner's name or email.
## ADR-022 — Applications: private resumes, one row, contact after acceptance
Date: 2026-09-25
Context: Phase 6 user decisions: both emails on acceptance, required resume file, optional note, withdraw and reapply, emails on apply and on decision.
Decision: One application row per student per listing. Withdrawing sets `withdrawn`; applying again updates that row and replaces the file. Accept and reject only move a `submitted` row, and only for the owning MSME. Resume files are stored under `uploads/resumes` with a generated key, git-ignored, and downloaded only by the student or that MSME. Sign-in emails are rendered only when the status is `accepted`. The note is optional and at most 1000 characters. Allowed resumes are PDF, DOC and DOCX up to 5 MB.
## ADR-023 — LLM through one OpenAI-compatible endpoint, optional
Date: 2026-09-26
Context: Phase 7 adds AI resume analysis. The user wants OpenAI-compatible endpoints first (OpenAI, Gemini's OpenAI mode, Ollama). Recorded after the fact, when Phase 7 was hardened.
Decision: `src/lib/llm/` calls `POST {LLM_BASE_URL}/chat/completions` with `fetch` (no SDK). `LLM_PROVIDER` is `disabled` (default) or `openai`. Any invalid setting (unknown provider, missing base URL) is logged and treated as disabled, so AI features never break a page. Calls time out after 30 s and return null on any failure. Prompts are admin-editable rows in `prompt`, falling back to built-in defaults. Tests force `LLM_PROVIDER=disabled` and stub `fetch`, so they never call a paid API. `LLM_FALLBACK_MODEL` is read but not used yet.

## ADR-024 — Resume analysis: one row per application, owner-triggered, text as data
Date: 2026-09-26
Context: The user decided PDF text extraction is included ("lightweight parser, pdf-parse"). `pdf-parse` 2.x requires the native `@napi-rs/canvas`, which is a risk on the Alpine Docker image.
Decision: Text comes from `unpdf` 1.8.1 for PDF (pure JS, no required dependencies), a built-in ZIP reader for DOCX, and printable runs for legacy DOC. Analysis runs in the background after each (re)application, and on demand only by the MSME that owns the listing. The result is upserted: one `analysis` row per application, replaced on re-analysis. The LLM gets a system message saying the listing and resume are data, and the resume is wrapped in `<resume>` tags (tags inside the text are stripped) and cut at 12,000 characters. The score is rounded to an integer and must be 0–100; anything else is a parse error and nothing is stored.

## ADR-025 — Rename MSME to organisation and student to user, everywhere
Date: 2026-09-26
Context: The product owner asked for "organisation" and "user" everywhere, including code and database.
Decision: Role values `user` / `organisation` / `admin`; models `UserProfile` / `OrganisationProfile`; enum `OrganisationStatus`; routes `/user`, `/organisation`, `/admin/organisations`. The database is renamed in place by migration `rename_roles` (`ALTER TYPE … RENAME VALUE` plus table, column, key and index renames), so existing rows, sessions and roles survive; `prisma migrate diff` from the database to the schema is empty. Old URLs redirect permanently. Earlier ADRs and changelog entries keep the old names as history. `User` (every account) and the `user` role now share a word: code uses `userProfile` for the role's profile and `applicantUserId` where an applicant's account ID is meant.

## ADR-026 — Separate sign-in and sign-up pages per role
Date: 2026-09-26
Context: The product owner wants different sign-in and sign-up pages for users, organisations and the admin; each sign-in page accepts only its own role; admins are still created only by the seed script (ADR-013).
Decision: `/sign-in` + `/sign-up` (user), `/organisation/sign-in` + `/organisation/sign-up`, `/admin/sign-in` (no sign-up, no Google). Password sign-in runs in a server action that verifies the password first, so a wrong password never reveals an account's role; the right password on the wrong page deletes the new session and names the right page. Accounts without a role take the page's role (never admin). Google sign-in returns through `/auth/continue?as=<role>`, which does the same check. The proxy sends signed-out visitors to the sign-in page for the area they asked for. The per-page role check is a UX rule, not an authorization boundary: Better Auth's own `/api/auth/sign-in/email` endpoint still signs anyone in, and every protected page and action keeps enforcing `requireRole`.

## ADR-027 — Toast notifications for all feedback
Date: 2026-09-26
Context: The product owner wants every alert and notification shown as a toast that matches the app (NFR-3), working on phones and desktops (NFR-4).
Decision: `sonner` 2.0.8, one `<AppToaster>` in the root layout, top-centre, themed with the app tokens (card surface, forest-green success, terracotta errors, `--radius`, Geist). Form errors returned by server actions become toasts through `useActionErrorToast`; inline error paragraphs are gone. Success messages, and outcomes of actions that redirect or return nothing, are queued by `flash()` in a short-lived `vp-flash` cookie (not HttpOnly, 60 s, no secrets); the root layout passes it to the toaster, which also reads it in the browser after each route change, shows it once per id, and deletes it. Persistent page state (an organisation's review status, "listings are hidden") stays inline, because it is not a notification.

## ADR-028 — Docker development with Compose watch
Date: 2026-09-26
Context: The product owner wants code changes to show up in the Docker app without rebuilding. The Next.js docs warn that Docker Desktop bind mounts on Windows and macOS can drop file events and advise against polling.
Decision: A `dev` stage in the Dockerfile and a `next-dev` service (profile `dev`) using Compose `develop.watch`. Compose watches the host and syncs `src/` and `prisma/` into the container, so `next dev` and nodemon get normal file events; config files restart the container; `package.json` or the lockfile rebuild it. The production `next` service moves to profile `prod`, so the two never both bind port 3000. `.env` and host build output are now in `.dockerignore`: images never contain secrets, and `.env` changes need the container recreated. `npm run docker:dev` and `npm run docker:prod` wrap the commands. All stages use `node:22-bookworm-slim`: the Alpine base broke `onnxruntime-node` (glibc only), so embeddings never worked in Docker. The dev container mounts the host's `.cache/models`, so it reuses the model instead of downloading it.

## ADR-029 — Role dashboards: server-rendered aggregates, CSS bars, no chart library
Date: 2026-09-26
Context: The product owner wants a dashboard per role with stats (FR-7), working on phones, tablets and desktops (NFR-4). No chart library is installed.
Decision: Each role's data comes from one function in `src/lib/dashboard/<role>.ts` (`getUserDashboard`, `getOrganisationDashboard`, `getAdminDashboard`). It runs Prisma `count` / `groupBy` / `aggregate` queries and small capped `findMany`s in one `Promise.all`, scoped to the signed-in account (except admin). Pages are server components; there is no client JavaScript and no new API. Bars are plain CSS (`BarList`) with the number shown as text. A chart library would add a dependency and client code for a handful of bars; trend charts are on the roadmap and can bring one in then. Prisma loads relations in a second query, so a row whose owner is deleted in between comes back without it: dashboard code drops such rows instead of failing the page.

## ADR-030 — Job recommendations reuse the listing search
Date: 2026-09-26
Context: Users see recommended jobs on their dashboard (FR-7).
Decision: Recommendations call `searchOpportunities` (ADR-021) with the profile's first 10 skills as the query and drop listings the user has applied to. With no skills, no results, or a search failure (for example, the embedding model is unavailable), the section shows the latest visible listings under "Latest opportunities". Search failures are logged and never break the dashboard. Each dashboard load with skills runs one embedding; the model is cached in memory after its first load.

## ADR-031 — Resume library: up to five per user, files shared with applications by reference
Date: 2026-09-26
Context: The product owner wants a user to keep several resumes and choose one per application, with skills extracted from each upload by the LLM (plan `plan/2026-09-26-resume-library-and-screening.md`).
Decision: A `resume` table holds up to 5 resumes per user profile; the cap is checked under a row lock on the profile (`SELECT … FOR UPDATE`), not Serializable isolation, which made different users' uploads conflict. Applying picks a library resume or uploads one, which joins the library. The application keeps its own `resumeFileName` / `resumeStorageKey` snapshot plus an optional `resumeId` (SetNull), so the organisation's download is unchanged and renaming or deleting a library resume never alters a sent application. A stored file is deleted only when no `resume` and no `application` row references its key. Skills are extracted once after upload, in the background, and normalised; `skillsStatus` is `pending`, `done`, `failed` or `skipped` (no LLM), with a retry. Old applications are not added to the library.

## ADR-032 — Listing assist: AI skills and draft screening questions, edited by the organisation
Date: 2026-09-26
Context: The product owner chose "AI drafts, organisation edits" for screening questions, and wants the listing's required skills extracted by the LLM.
Decision: When an organisation creates a listing, the server calls the `listing_assist` prompt synchronously (30 s timeout; the save never fails because of it). The returned skills are normalised and merged after the organisation's own skills in the existing `skills` field (cap 15), never replacing them. Up to 4 questions are drafted (`source = ai`) only when the listing has none and nobody has applied. The organisation is sent to the edit page to review them, and a "Suggest with AI" button re-runs the assist. A listing published without ever being assisted gets a background, skills-only assist. Questions (max 8, 5–300 characters) are stored in `opportunity_question`; a question stays `ai` only while its text is unchanged. Once a listing has any application its questions are locked: an identical list saves, anything else is refused and rolls back the whole save.

## ADR-033 — Skill-based recommendations and combined screening scores
Date: 2026-09-26
Context: The product owner chose skill overlap plus semantic similarity for recommendations, and a combined score visible only to organisations, filterable by score and apply time. Supersedes ADR-030 (recommendations no longer reuse the listing search).
Decision: A user's skills are the union of skills from resumes with `skillsStatus = done`, else the profile's skills. For each visible listing the user hasn't applied to (up to 300, ordered by similarity), match = 0.7 × share of the listing's skills the user has (after normalisation and a small alias map) + 0.3 × cosine similarity between the embedded skill list and the listing embedding; listings below 0.25 are dropped. No LLM call is made to show recommendations. On any failure the dashboard falls back to the latest listings. Screening: the resume is scored by `resume_analysis` and all answers in one `answer_scoring` call, each answer in `<answer>` tags. The overall score is computed in code: 60% resume + 40% answers, or whichever part exists. A part that fails on re-analysis keeps its previous score. Reapplying clears the old analysis. Scores are never selected for user-facing pages. Background work goes through `runInBackground` (`src/lib/background.ts`), which logs failures and lets tests wait for it.

## ADR-034 — LLM model: gemma4:31b on Ollama Cloud
Date: 2026-09-26
Context: The product owner wants the fastest model that uses the fewest tokens. The Ollama Cloud key lists 17 models; on its free plan only `gemma4:31b`, `gpt-oss:20b`, `gpt-oss:120b`, `nemotron-3-nano:30b`, `nemotron-3-super` and `nemotron-3-ultra` answer, and the other 11 return HTTP 402.
Decision: `LLM_MODEL=gemma4:31b`, `LLM_BASE_URL=https://ollama.com/v1`. Benchmark on the resume-scoring prompt, one request at a time, 3 runs each: gemma4:31b median 0.92 s and ~86 output tokens; gpt-oss:20b 3.67 s and ~195; nemotron-3-super 4.27 s and ~191. A single run of all six also put gpt-oss:120b, nemotron-3-nano:30b and nemotron-3-ultra behind (7–12 s, 200–270 tokens). All returned valid JSON. gemma wraps JSON in code fences, which `parseJsonObject` already strips. It is not a reasoning model, so no hidden reasoning tokens count against `LLM_MAX_TOKENS`. Parallel requests on the free tier queue (9 at once took ~10 s each), so bursts of analyses will be slower than single calls. Revisit if the plan changes or quality proves too low.

## ADR-035 — Interview events and Meet links from one platform Google account
Date: 2026-09-26
Context: Scheduled interviews must send a Google Meet link to the candidate and the interviewers. The user chose one platform Google account over per-organisation Google connections, and allowed a personal Gmail account for now. Research (plan `plan/2026-09-26-hiring-pipelines-and-interviews.md`): service accounts can't invite attendees or create Meet without Workspace domain-wide delegation; External OAuth apps in "Testing" get refresh tokens that expire after 7 days (developers.google.com/identity/protocols/oauth2); `guestsCanSeeOtherGuests` is a documented event field.
Decision: `src/lib/google-calendar.ts` calls the Calendar REST API with `fetch` (no SDK), using an access token refreshed from `GOOGLE_CALENDAR_REFRESH_TOKEN` (with the existing `GOOGLE_CLIENT_ID/SECRET`) and cached in memory. Events are created on `GOOGLE_CALENDAR_ID` (default `primary`) with `sendUpdates=all`, `conferenceDataVersion=1`, a Meet `createRequest` for interview stages only, and `guestsCanSeeOtherGuests: false`. Outside production, reserved-domain attendees are dropped (they'd bounce). Calls time out after 15 s and never throw. The database row is written first and synced in the background with a `calendarSync` status (`pending`, `synced`, `failed`, `disabled`) and a retry; VenturePath's own emails are always sent, so scheduling works (without Meet links) when Calendar isn't configured. The refresh token comes from `npm run google:calendar-token`. Publish the OAuth app "In production" (unverified is fine for one account) to avoid the 7-day expiry. Per-organisation Google connections are deferred.

## ADR-036 — Hiring managers: an invited role bound to one organisation
Date: 2026-09-26
Context: Organisations want employees to run interviews (user decisions D3, D4).
Decision: New role `hiring_manager`. An organisation invites a name and email (`/organisation/team`); the invite link carries 32 random bytes, only their SHA-256 is stored, it expires after 7 days and works once. At most 20 pending invites per organisation. `acceptInvite` is the only writer of this role: the signed-in account's email must match the invite, its role must be empty or already `hiring_manager`, and it can be an active member of only one organisation (`organisation_member.userId` is unique). The role check is conditional, so a role assigned meanwhile is never overwritten. HMs have no sign-up page: they sign up on the invite page (email verification returns them there), or sign in at `/hiring-manager/sign-in` with the invite continuing afterwards. `requireActiveHiringManager` guards every HM page; deactivating a member cuts access at once and keeps their past feedback. An HM sees only the interviews they are assigned to, in their active organisation: candidate name, resume, screening answers and the listing, never the candidate's email or AI scores. The organisation owner schedules and decides. An "AI Hiring Manager" option is shown disabled ("coming soon").

## ADR-037 — Per-listing hiring pipelines with a soft lock, wrapping accept and reject
Date: 2026-09-26
Context: User decisions D2, D5, D6, D7.
Decision: A listing has up to 10 ordered stages (`interview`, `test`, `assignment`, `other`) with optional instructions, an http(s) link and a default duration. Stages can be filled from another of the organisation's listings or from the LLM (`pipeline_suggest` prompt; suggestions are only applied to the editor, never saved without the organisation). A stage is "reached" once a candidate is at it, has history there, or has a scheduled event there; reached stages can't be deleted, change kind or change relative order, and no stage may be inserted before the last reached stage. Saves are stale-checked with a version string. `Application.currentStageId` null means "Applied". Advancing past the last stage accepts the application and failing any stage rejects it, through the existing decision path and emails; direct accept/reject stays available. Leaving a stage (advance, move) cancels that stage's future events; leaving `submitted` cancels all of them. Each move writes a `stage_event`. Listings without stages behave as before. Times are entered and shown in India time (IST, fixed +05:30).

## ADR-038 — VenturePath v2 scope and one up-front migration
Date: 2026-11-12
Context: The user approved `docs/PRODUCT.md` (renamed from Pramaan): challenges, proof cards and an AI interviewer, built in 3 days by parallel agents.
Decision: All v2 tables and fields land in one migration (`venturepath_v2_challenges_proof_interview`) before any feature work, with a shared contract in `src/lib/v2/types.ts`, so four work packages can build in parallel without schema conflicts. `Application.resumeFileName/resumeStorageKey` become nullable because a student may apply with proof cards only; code that assumed a resume now treats it as absent. `ai_interview` is a new `StageKind`, never scheduled on a calendar (`UNSCHEDULED_STAGE_KINDS`). Prompt defaults for v2 live in one file per package (`src/lib/llm/defaults-v2/`) to avoid edit conflicts.

## ADR-039 — Gemini for text and voice AI; Postgres host port configurable
Date: 2026-11-12
Context: `.env` had the LLM disabled. The user supplied a Google Gemini key for the live voice interview.
Decision: Text AI uses `gemini-3.5-flash` through Gemini's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai`) with the existing OpenAI-compatible client; `LLM_MAX_TOKENS=4096` because the model spends tokens on thinking (a 100-token cap returned a cut-off reply). Measured 2026-11-12: ~2 s for a tiny reply, 5.5–10.7 s for a 6-question plan, JSON parsed. `gemini-3.7-flash`/`3.8-flash` returned 503 "high demand" that day; `gemini-3.5-flash-lite` is the configured fallback (unused by code, ADR-034 note). Voice uses `gemini-3.8-live` (listed with `bidiGenerateContent` for this key). Keys live only in `.env`. The Docker Postgres host port is now `${POSTGRES_HOST_PORT:-5432}` because a local Homebrew Postgres already holds 5432 on the developer machine (5433 used locally).

## ADR-040 — Challenge rewards, locking and status without a scheduler
Date: 2026-11-12
Context: Modules 1–2; `ChallengeSubmission.rewardStatus` holds one value but a challenge can offer money and hiring.
Decision: A challenge needs money, hiring, or both. Money is paid outside the app and only to the winner; hiring can go to the winner or runner-up. A money + hire winner must be marked paid before the hire offer, so `hire_offered` implies paid. A challenge can't close while a money winner is unpaid or when it has submissions but no winner. Judging points and the reward lock at the first submission so students keep the terms they entered on. Placements are set only while `judging`; a recorded reward freezes that placement. Open challenges past their deadline move to `judging` lazily (one `updateMany` before reads); owners can stop submissions early; a deadline date means the end of that day in India time. Creating, editing and publishing need an approved organisation.

## ADR-041 — Challenge AI scoring, similarity and proof files
Date: 2026-11-12
Decision: The model scores each judging point 0–5 with a quote; code computes the 0–10 total. Quotes not found in the student's text are dropped; student text is wrapped as data with a system message that it is not instructions; stale results (submission edited meanwhile) are discarded. Similarity re-embeds the challenge's submissions with the local model on each submit and stores only `similarToId` (threshold `SIMILARITY_FLAG_THRESHOLD`); the warning shows in both directions. Students never see scores. A challenge proof card stores its own copy of the submission file so deleting one never removes the other.

## ADR-042 — Proof check is plausibility, not verification
Date: 2026-11-12
Decision: 🔵 Checked needs the evidence to open (a reachable link, or a file when there is no link) and an AI score ≥ 3/5 for "What I did" against the skills; link content is never fetched or read. The request is HEAD then GET, 5 s timeout, at most 3 manually followed redirects, default ports only, each hop checked against private, loopback, link-local, CGNAT, multicast, documentation, IPv4-mapped and NAT64 ranges after DNS resolution; URLs with credentials, `localhost`, `*.local` and `*.internal` are refused. Accepted residual risk: DNS rebinding between our lookup and `fetch`'s (blind request, body never read). A manual card needs a link or a file. Proof cards attached to an active application can't be edited or deleted until it is withdrawn; edits reset the card to ⚪ and re-run the check (stale results discarded). Students see the badge and a plain status, never the AI score.

## ADR-043 — Apply with proof
Date: 2026-11-12
Decision: An application needs at least one proof card or a resume; an apply-task answer counts as a proof card. Up to 3 cards; resubmitting replaces the attached set and updates the apply-task card in place. Task cards don't count toward the 10 manual cards. Without a resume, screening's resume part scores the attached cards' text instead; college name is never a ranking input.

## ADR-044 — AI interview sessions, chat channel and report
Date: 2026-11-12
Context: Modules 5–6: an AI screen that never decides, works with AI off, and gives the same report for chat and voice. Ported ideas from FoloUp and aural-oss (MIT, `THIRD_PARTY_NOTICES.md`).
Decision: Reaching an `ai_interview` stage through the pipeline creates (or, on re-entry, re-issues) one `InterviewSession` per application and stage: 32 random bytes, only the SHA-256 stored, 3-day link, one attempt, completed sessions never reset. It starts from a fixed 6-question bank that the AI plan replaces only when valid (2 skill / 2 proof / 1 situation / 1 motivation); then the invite is emailed. Leaving the stage expires an unfinished session (explicitly in `pipeline-progress`, and otherwise whenever the application is no longer at that stage, e.g. direct accept/reject). `expiresAt` only blocks starting. Chat answers are optimistic-concurrency writes on question index, transcript length and `updatedAt`; follow-ups capped at one per question in code; paste and tab leaves are flags only. The report has two passes (`interview_evidence` keeps only verbatim student quotes; `interview_report` scores 0–5 from those quotes); the recommendation is computed in code (average ≥ 3.5 with no skill < 2 → strong; ≥ 2.5 → maybe; else not a fit). Visible to the organisation owner only; background code never moves or rejects a candidate. Sign-in accepts `next` only as `/interview/<token>`.

## ADR-045 — Voice interview: LiveKit Agents sidecar on Gemini Live
Date: 2026-11-12
Context: Module 5 voice. The user chose DeepInterview's live part (Apache-2.0) and Gemini Live `gemini-3.8-live`.
Decision: Voice runs as a Python LiveKit Agents sidecar (`voice-agent/`, `livekit-agents`/`livekit-plugins-google` 1.8.10, Python 3.13) adapted from DeepInterview's live part. The app owns the plan and the report: the agent fetches the plan and posts transcript batches over shared-secret endpoints (`/api/voice-agent/sessions/[id]/{plan,transcript}`, constant-time secret check), receives each question only through a `next_question` tool, and the director caps follow-ups at one per question; a guard caps the session at 25 minutes. Turns are de-duplicated by (role, questionId, at, text) under a row lock, so retries need no schema change; `currentIndex` never moves backwards. A finished voice session starts the same report as chat. Only transcripts are stored, never audio. The student's browser gets a short-lived LiveKit token (`/api/interview/[token]/livekit-token`, mic publish only) for room `vp-interview-<sessionId>` with the agent explicitly dispatched. The Gemini Live API version is `v1alpha` (`VOICE_LIVE_API_VERSION`) because the SDK default `v1beta` returned 404 for this key on 2026-11-12. Locally LiveKit is `livekit-server --dev` v1.13.11 in Docker (`voice` profile), with the agent sharing its network namespace. Voice stays behind `VOICE_INTERVIEW_ENABLED` (default false); any failure falls back to chat from the same question. Smoke-tested 2026-11-12 with a scripted client (full 2-question interview, follow-up, disconnect → resumable in chat); about 2–2.5 s from end of speech to the AI speaking. Not yet tested with a real browser mic or Indian accents.

## ADR-046 — Retry once on the fallback LLM model; "AI unavailable" report state
Date: 2026-11-12
Context: The end-to-end run hit Gemini's free-tier daily limit (429) on `gemini-3.5-flash` while `gemini-3.5-flash-lite` still answered, and 503 "high demand" errors are common. `LLM_FALLBACK_MODEL` was read but never used (ADR-034 note).
Decision: `createLlmClient().chat` retries once on `LLM_FALLBACK_MODEL` (when set and different) after a 429, a 5xx, a timeout or a network error; bad requests, auth errors and empty replies are not retried. Rate limits are per model, so this roughly doubles the usable free quota. When no LLM is configured, the AI interview report panel says "AI unavailable" and hides "Retry report" (PRODUCT.md §3 rule 7). Proof-only applications label the screening score "Proof" instead of "Resume".

## ADR-047 — Hiring board and the offer step
Date: 2026-11-13
Context: Plan `2026-11-12-hiring-and-ai-interview-v2` (user decisions D1–D3): the applicants page was a long list of three cards per candidate with conflicting Accept/Move buttons, and "Accept" skipped every stage.
Decision: The applicants page is a board with tabs Applied · each pipeline stage · Offer · Hired · Not selected (counts, earliest non-empty tab first), one row per candidate with one next-step button, name search and Best match / Newest sorting; bulk "Send AI interview" / "Not selected" and "Compare (2–4)". A candidate page shows proof, the AI interview report, AI screening, live interview, answers and a timeline, with one action bar and Previous/Next. Advancing from the last stage no longer accepts (`last_stage`); the owner makes an offer (message, optional stipend ₹/month, optional start date not in the past, IST). The student accepts (application `accepted` through the decision path, `passed` event by the offer maker, future events cancelled, open AI interviews expired) or declines (stays on Offer; the owner can re-offer or mark not selected). Direct Accept is removed; `decideApplication` only marks Not selected, with an optional kind reason (≤ 500 characters) that is stored and emailed. A pending offer blocks advance/move/reject until withdrawn. All offer writes are conditional updates. "Use recommended steps" (AI interview → Live interview) is created only on a click and only when the listing has no stages (D3). Supersedes ADR-037's "advancing past the last stage accepts" and "direct accept stays available".

## ADR-048 — Anchored interview rubric, per-question scores and report retries
Date: 2026-11-13
Context: Reports gave 5/5 to everything, had no per-question view or single score, and failed on one Gemini 503/429.
Decision: Pass B scores skills and questions against fixed anchors (0 none · 1 vague claim · 2 generic · 3 one specific example · 4 with method and result · 5 several with results); a generic answer is capped at 2; length, confidence and English level are ignored. Code enforces 0 for a skill without verified quotes and for an unanswered question, and that question ids match the plan. Score = mean skill score on 0–100 (`interviewScore`, shared by the board, report and compare); recommendation thresholds unchanged (≥ 70 with no skill below 2 → strong; ≥ 50 → maybe). Reports retry in the background after 20 s and 60 s (`REPORT_RETRY_DELAYS_MS`, `reportAttempts`) before `failed`; a stale pending (> 5 min) is reclaimed keeping its count; manual retry resets it. A compare page (owner-only, 2–4 candidates) aligns skills by name. Live calibration 2026-11-13 (`gemini-3.5-flash-lite`): strong / average / weak transcripts scored 80 / 52 / 28.

## ADR-049 — Focused AI interview room and business-aware questions
Date: 2026-11-13
Decision: `/interview/[token]` renders without the site header and footer inside `InterviewFrame` (top bar + 6-step progress) with a before-you-start screen (6 questions · ~15 min · one attempt, tips, consent) and, for voice, a browser mic check (permission + level meter, nothing recorded) before Start. Chat has bubbles, a typing indicator, Enter to send (Shift+Enter new line, ignored while an IME is composing), optimistic display and retry; unsent answers are kept in localStorage under a hash of the token (never the token) and tied to the transcript length. Server-side concurrency protection is unchanged. The question plan prompt gets the business name, industry, location and description and asks for a fixed order (business-tied opener, proof, skill, proof, situation, motivation); validation is still 2/2/1/1. Students can start or continue from My Applications: a POST issues a fresh token for their open session (only hashes are stored) and the old emailed link then shows a note pointing back.

## ADR-050 — Visual redesign: white canvas, Poppins, single green accent
Date: 2026-11-13
Decision: The UI follows a marketplace-style design system the user picked as reference (unjob.ai): Poppins for all text (replacing Geist + Newsreader), white background, `#121212` text, `#737373` muted text, `#e5e5e5` borders, one green accent `#00bf63` (text uses `#00994f` for contrast), pill-shaped buttons, 8px inputs, 12–24px card radii and soft shadows (`shadow-card`, `shadow-pop`). Tokens live in `globals.css` (`--brand`, `--brand-strong`, `--brand-soft`). Public pages use a full-width sticky header (`SiteHeader`) instead of the framed card; dashboards use a sticky desktop sidebar and a fixed bottom tab bar on phones. The product name is shown as "Venture Path" in the UI; emails and internal identifiers still say VenturePath. Only the visual style is borrowed: no copy, logo or assets from the reference site.
