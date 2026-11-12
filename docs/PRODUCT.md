# VenturePath — What We Are Building (module-wise)

**Status:** approved 2026-11-12 — in progress
**Date:** 12 Nov 2026 · **Build window:** 3 days
**Codebase:** this repo (Next.js 16, Prisma 7 + Postgres/pgvector, Better Auth, shadcn/ui)
**Rule for every screen:** simple enough for a shop owner with no HR team and a student on a phone.

This file is the single living description of the product. It replaces the M1–M11 scope in the research pack's `BUILD_PLAN.md` (parent folder) for this build: only what is below gets built.

---

## 1. The product in one line

MSME owners find talent through **proof, not resumes**. They can post a real **business challenge** (best solution wins money or a hire), or **open a job** where an **AI interviewer** screens shortlisted students and writes a report. A human always makes the final decision.

## 2. The two sides

```text
SIDE 1 — CHALLENGES
MSME posts problem + reward → students submit solutions → AI sorts them
  → MSME picks winner → pays ₹ (outside app) or offers hire → winner gets a verified proof

SIDE 2 — DIRECT HIRING
MSME posts job → students apply with proof → AI screening ranks them → MSME shortlists
  → AI interview (chat) → AI report → optional live Meet interview → MSME hires / rejects
```

Proof connects the two sides: winning a challenge gives the student a 🟢 verified proof, and that proof helps them in job applications.

## 3. Rules that never change

1. **A human decides.** AI only sorts, scores and explains. Nothing is ever rejected automatically.
2. **Students never pay** and never see their AI scores.
3. **A challenge must have a reward**: money, a hire offer, or both. No free work.
4. **Only admin-approved MSMEs** can post challenges or jobs (already enforced for jobs).
5. **The AI interview is text chat or voice, never video.** No face or emotion analysis. The student agrees before starting, and text chat is always available as a fallback.
6. **Every AI score quotes the student's own words**, so the owner can see why.
7. **The app works with AI switched off.** Without an LLM the AI features show "AI unavailable" and everything else still works.

## 4. What already exists (reused, not rebuilt)

| Already working | Where |
|---|---|
| Sign-in per role (student, MSME, admin, hiring manager) | `src/lib/auth.ts`, `authz.ts` |
| Admin approves MSMEs | `organisation-review.ts`, `/admin/organisations` |
| Job posting with AI skills and screening questions | `opportunities.ts`, `listing-assist.ts` |
| Browse and semantic search | `search.ts`, `embeddings.ts` |
| Apply, resume library, AI resume and answer scores | `applications.ts`, `resume-analysis.ts`, `answer-scoring.ts` |
| Hiring pipelines, Meet scheduling, hiring managers | `pipelines.ts`, `pipeline-progress.ts`, `scheduling.ts` |
| Emails, background jobs, admin-editable prompts | `email.ts`, `background.ts`, `prompts.ts` |
| LLM client (any OpenAI-compatible API) | `src/lib/llm/` |

---

## 5. Modules

Each module lists **what people see → rules → data → files → done when**. Modules are ordered by build order.

### Module 0 — Foundation

**Goal:** everything the other modules need, done once.

- **One** Prisma migration with all new tables and fields (section 6). This avoids schema changes mid-build.
- Check the LLM: run one real chat, check the JSON parses and measure speed. Switch models on Day 1 if it's too slow.
- Demo seed script `npm run db:seed:demo`: 1 approved MSME, 3 students with proofs, 1 open challenge, 1 job with an AI-interview stage.
- **Done when:** the migration applies, `npm test` still passes, and the LLM returns a valid JSON reply.

### Module 1 — Challenges: post and submit

**MSME sees:** "Post a challenge" with one form:

| Field | Note |
|---|---|
| What's the problem? | Their own words |
| What would a good solution look like? | Optional |
| Reward | 💰 Money ₹___ and/or 🤝 Hiring (internship/job offer). At least one is required |
| Deadline | Date |
| File | Optional (sample sheet, photo) |

- The **"Make it clearer with AI"** button rewrites the problem and drafts **3 judging points**. The owner can edit them.
- The owner can publish or save a draft.

**Student sees:**
- `/challenges`: cards showing title, business name, reward and days left.
- Challenge page with one **Submit solution** box: text, plus an optional link or file. One submission per student, editable until the deadline.

**Rules:**
- Only approved MSMEs can publish, and a reward is required.
- Submissions close at the deadline (India time).
- Judging points lock once the first submission arrives.

**Data:** `Challenge`, `ChallengeSubmission`

**Files (new):**
- logic: `src/lib/challenges.ts`, `challenge-schemas.ts`, `challenge-assist.ts`
- MSME pages: `src/app/organisation/challenges/{page,new,[id]/edit}`
- student pages: `src/app/challenges/{page,[id]}`

**Done when:** an approved MSME publishes a ₹ challenge and two students submit.

### Module 2 — Challenges: judging and reward

**MSME sees:** `/organisation/challenges/[id]/submissions`
- A list sorted by **AI score (0–10)**. Each submission shows a one-line reason and a quote from the student.
- Opening a submission shows the full solution and an AI breakdown against the 3 judging points.
- **Pick as winner** (runner-up is optional), then a reward step:
  - Money → **Marked as paid** (paid outside the app by UPI/cash, recorded as `paid`)
  - Hire → **Offer hire**: emails the winner with the owner's message and an optional link to a job listing
- **Close challenge** once judging is done: status moves Open → Judging → Done.

**Student sees:** the result on the challenge page and on their submissions list (Winner / Runner-up / Not selected), plus an email.

**Rules:**
- AI scoring runs in the background when a solution is submitted. Only the MSME sees scores.
- Winner and reward actions save `decidedById` and the time.
- The challenge can't be marked Done until any money reward is marked paid.

**Data:** fields on `ChallengeSubmission`

**Files:**
- new: `src/lib/challenge-scoring.ts`, `challenge-reviews.ts`
- edit: `email.ts` (2 new emails)

**Done when:** the owner picks a winner, marks it paid, everyone gets an email, and the winner's proof turns 🟢.

### Module 3 — Proof cards

**Student sees:** a **My Proof** page (`/user/proof`) with an **Add proof** form:
- what you made (title)
- link (GitHub, live site, Canva, Drive, YouTube, Instagram) **or** a file
- "What I did" (2–3 lines)
- skill tags

**Trust badges:**

| Badge | How it's earned |
|---|---|
| ⚪ Added | Student added it |
| 🔵 Checked | The link opens (server check), and AI judged that "What I did" matches the skill tags. Gets a 0–5 score with a reason |
| 🟢 Verified by business | Created automatically when the student wins or places in a challenge |

- Every challenge submission also appears as a proof card (⚪ until judged).
- **MSME sees** a student's proof cards on their applicant and submission views, strongest badge first.

**Rules:**
- Up to 10 manual proof cards per student.
- Students can't edit the badge level. Only the app code sets it.
- The AI check never fetches or reads the content behind a link. It only checks that the link responds, so 🔵 means "plausible", not "verified". The UI says so.

**Data:** `Proof`

**Files:**
- new: `src/lib/proofs.ts`, `proof-schemas.ts`, `proof-check.ts`, `src/app/user/proof/page.tsx`
- edit: student nav, public profile view

**Done when:** a student adds a link proof and it turns 🔵, and a challenge winner shows a 🟢 card.

### Module 4 — Jobs: apply with proof

Small changes to the existing job flow:

- **Apply form:** "Attach your proof" (pick 1–3 proof cards). The resume becomes optional.
- **Optional apply task** (cut first if late): the MSME adds a 30–60 minute task to a listing, and the student's answer becomes a proof card.
- **Applicants page:** proof cards appear first, and AI screening also uses proof text (screening already exists).
- **Pipeline AI suggest** now proposes: Applied → **AI Interview** → Live interview → Hired.

**Rules:**
- An application needs at least one proof card or a resume.
- College name is not used in ranking.

**Data:** link table between `Application` and `Proof`; optional `Opportunity.applyTask`

**Files (edit):** `applications.ts`, the apply form in `src/app/opportunities/[id]`, the applicants page, `pipeline-assist.ts`

**Done when:** a student applies with a proof card and the MSME sees it at the top of the applicant card.

### Module 5 — AI Interviewer

**Built from three open-source repos, one job each:**

| Part | Taken from | Why this one |
|---|---|---|
| **Brain:** question plan from job + proofs, follow-up rules, report prompts | **FoloUp** (`FoloUp/FoloUp`, 1.28k★, MIT, Next.js 16, Oct 2026) | The most-used employer-side AI interviewer, and TypeScript like our app. We port its prompts and flow, not its Clerk/Supabase/Retell stack. |
| **Text chat mode** + integrity log (paste, tab switches) | **aural-oss** (MIT, Nov 2026) | A clean chat-interview pattern. Always-on fallback, works on any phone. |
| **Voice mode:** live spoken interview over LiveKit | **DeepInterview** (`ngoanpv/DeepInterview`, Apache-2.0, v0.3.0 Aug 2026) | **Only its live part**: `apps/agent/.../live/` (interviewer, director, guard, state) + `worker.py` on LiveKit Agents 1.6, with end-of-turn detection and barge-in. Its CV prep, LangGraph planner, coach and report are **not** used. |

**One brain, two channels.** Our TypeScript code makes the question plan and writes the report for **both** modes. The voice agent only *speaks* the plan and sends back the transcript. The MSME gets the same report whether the student typed or talked.

```text
Next.js app (ours)                                  voice-agent/ (Python sidecar, from DeepInterview live/)
 ├─ makes question plan (FoloUp prompts)  ──GET /api/interview/[token]/plan──►  interviewer speaks questions,
 ├─ mints LiveKit room token                                                    max 1 follow-up each (guard.py)
 ├─ /interview/[token]: [💬 Chat] [🎤 Voice]   ◄──POST /api/interview/[token]/transcript──┘
 └─ writes the report from the transcript (same for chat and voice)
            LiveKit server (livekit-server --dev in Docker, free) carries the audio
```

Notices: MIT (FoloUp, aural-oss) and Apache-2.0 NOTICE (DeepInterview) go in `THIRD_PARTY_NOTICES.md`; ported files keep their headers.

**MSME sees:**
- A new pipeline stage type **"AI Interview"**. It replaces the disabled "AI Hiring Manager – coming soon" option.
- On the applicants page, tick candidates → **Send AI interview**. This moves them to that stage using the existing Advance/Move logic.

**Student sees:**
1. An email with a private link `/interview/[token]`, valid 3 days, one attempt.
2. An intro: *"An AI will ask you 6 questions about this role (~15 min). The business makes the final decision."* The student picks **💬 Chat** or **🎤 Voice**, then **I agree, start**.
3. **Chat:** one question at a time, the student types an answer, and the AI may ask **at most one follow-up** per question if the answer is vague.
   **Voice:** the AI asks out loud, the student answers out loud, and live captions show both sides. If the mic or connection fails, a **Switch to chat** button continues from the same question.
4. "Submitted ✓". No score is shown.

**How questions are made** (generated once, when the invite is sent):
- 2 questions from the job's skills
- 2 from the student's own proof cards ("You built X. How did you handle Y?")
- 1 real-situation question for the business ("A customer complains about Z…")
- 1 on motivation and availability

If the AI is off or fails, a fixed question bank for the role is used and there are no follow-ups.

**Rules:**
- Only the MSME can send an invite; the AI never picks who to interview.
- Consent is saved before the first question.
- Pasted answers and leaving the tab are counted and shown in the report as flags, never as reasons to reject.
- Answers are capped at 1,500 characters, about 20 minutes total.

**Voice mode rules:**
- Audio isn't stored by us; we keep only the transcript. The consent text says so.
- Voice is turned on by `VOICE_INTERVIEW_ENABLED=true`. When it's off or the sidecar is down, only Chat is offered.
- The voice agent can only ask questions from the plan our app gives it, plus at most one follow-up per question. It never scores anything.

**Data:** `InterviewSession` (+ `mode: chat|voice`); new value `ai_interview` in `StageKind`

**Files:**
- new: `src/lib/ai-interview.ts` (plan, follow-up, state), `ai-interview-schemas.ts`, `src/app/interview/[token]/page.tsx`
- new: `src/app/api/interview/[token]/{plan,transcript,livekit-token}/route.ts` (voice-agent endpoints use a shared secret)
- new: `voice-agent/`, a Python sidecar adapted from DeepInterview `live/` + `worker.py`, run with `uv`
- edit: `pipeline-schemas.ts`, `pipeline-progress.ts` (create a session and email when a candidate reaches the stage), the pipeline editor UI, `docker-compose.yml` (adds `livekit` and `voice-agent` services)
- npm (current versions, checked 12 Nov 2026): `livekit-server-sdk` 2.19.3, `livekit-client` 2.24.0, `@livekit/components-react` 2.9.25

**Voice model: Gemini Live `gemini-3.8-live` (chosen).** It's a speech-to-speech model: it hears the student and speaks back directly, so there's **no separate speech-to-text or text-to-speech service** (no Deepgram or Cartesia). It runs through the LiveKit Agents Google plugin (`livekit-plugins-google`, realtime model). DeepInterview's own default live tier is also Gemini.
- **Key check:** done on 12 Nov 2026. The key lists `models/gemini-3.8-live` with `bidiGenerateContent` (live streaming) support. A real voice session hasn't been run yet; that happens on Day 3.
- **Transcripts:** Gemini Live's built-in input/output transcription produces the text that goes into our report.
- **Keeping it on-plan:** a realtime model can drift, so the agent gets **only the current question** through a `next_question` tool call. DeepInterview's `director.py`/`guard.py` handles moving between questions and the one-follow-up cap, so the model can't invent its own questions.
- **Config** (values live in `.env`, which is git-ignored; never in this file):

```bash
VOICE_INTERVIEW_ENABLED=true          # off by default; chat is always available
GOOGLE_API_KEY=<set in .env>          # Gemini API key
VOICE_LIVE_MODEL=gemini-3.8-live      # fallback if needed: gemini-3.1-flash-live-preview
LIVEKIT_URL=ws://localhost:7880       # local livekit-server --dev
LIVEKIT_API_KEY=devkey                # --dev defaults
LIVEKIT_API_SECRET=secret
VOICE_AGENT_SHARED_SECRET=<random>    # voice-agent ↔ Next.js API
```

**Done when:** a shortlisted student finishes a 6-question **chat** interview from the email link (must have), and the same plan runs as a **voice** interview on a laptop mic (stretch, Day 3).

### Module 6 — AI Interview Report

**MSME sees** an **AI Interview report** panel on the applicant:

```text
Recommendation: 🟢 Strong fit | 🟡 Maybe | 🔴 Not a fit   (advice only)
Skill            Score  Evidence (student's words)
Content writing  4/5    "I wrote 30 posts for my uncle's sweet shop…"
...
✅ Strengths  ⚠️ Check in live interview  🚩 Flags (pasted answer, left tab 3×)
[View full chat]  [Move to live interview]  [Reject]
```

**How the report is made:** two AI passes after the interview finishes.
1. Pass A pulls the quotes that matter for each skill.
2. Pass B scores each skill 0–5, using only those quotes.

The recommendation is worked out **in code** from the scores, not chosen by the AI, so the AI can't inflate it.

**Rules:**
- Only the MSME sees the report. Hiring managers and students don't (same as the existing AI-score rule, ADR-033/036).
- Move and Reject use the existing decision path, which records the human who acted.
- If report generation fails, show the full chat and a **Retry report** button.

**Data:** `report` and `recommendation` fields on `InterviewSession`

**Files:**
- new: `src/lib/ai-interview-report.ts`, `src/components/hiring/ai-interview-report.tsx`
- new admin-editable prompts: `interview_questions`, `interview_followup`, `interview_report`

**Done when:** the MSME opens the report, sees scores with quotes, and moves the student to the live interview.

### Module 7 — Navigation, polish, demo

- **Student nav:** Challenges · Jobs · My Proof · My Applications
- **MSME nav:** Challenges · Jobs · Team (existing) — "Review" lives inside each challenge or job
- Dashboard cards: open challenges (student), submissions waiting (MSME)
- Phone check at 375px on every new page
- **Done when:** the demo story in section 8 runs twice without errors.

---

## 6. Data model (new / changed)

```text
Challenge            id, organisationProfileId, title, problem, goodSolution?, criteria[3],
                     rewardMoneyInr?, rewardHire(bool), deadline, fileKey?,
                     status(draft|open|judging|done), criteriaLockedAt?, publishedAt?, timestamps

ChallengeSubmission  id, challengeId, userProfileId (unique per challenge), text, link?, fileKey?,
                     aiScore?, aiReason?, aiBreakdown(json)?,
                     placement(none|winner|runner_up), rewardStatus(none|paid|hire_offered),
                     decidedById?, decidedAt?, timestamps

Proof                id, userProfileId, title, whatIDid, link?, fileKey?, skills[],
                     source(manual|challenge|apply_task), challengeSubmissionId? (unique),
                     level(added|checked|verified), aiScore?, aiReason?, timestamps

Application ↔ Proof  join table (applicationId, proofId)
Opportunity          + applyTask?                       (optional, Module 4)
StageKind            + ai_interview

InterviewSession     id, applicationId, stageId, tokenHash, status(invited|in_progress|completed|expired),
                     expiresAt, consentedAt?, questions(json), transcript(json),
                     pasteCount, tabLeaveCount, report(json)?, recommendation(strong|maybe|not_fit)?,
                     startedAt?, completedAt?, timestamps
```

4 new tables, 1 join table, 1 new field, 1 new enum value. Invite tokens are stored as a SHA-256 hash, the same way hiring-manager invites already are.

## 7. Open-source tools

**New dependencies: none planned.** Everything builds on what's already in `package.json` (Next 16.3, React 19.2, Prisma 7.10, Better Auth 1.7, zod 4, shadcn, sonner, transformers.js embeddings), all current versions. We borrow **ideas and patterns** from these maintained repos (checked 12 Nov 2026):

| Module | Repo (stars, last push) | License | What we take |
|---|---|---|---|
| **5–6 AI Interviewer + report (main base)** | `FoloUp/FoloUp` (1.28k★, Oct 2026, Next.js 16) | MIT | Interview flow, question-generation and analysis/insights prompts, results view. Ported onto our stack (skips Clerk, Supabase, Retell) |
| 5 Chat mode + integrity | `1146345502/aural-oss` (225★, Nov 2026) | MIT | Text-chat interview mode, follow-up depth, paste/tab-switch integrity log |
| 5 Voice mode | `ngoanpv/DeepInterview` (71★, v0.3.0, last push Oct 2026) | Apache-2.0 | **Live interview part only** (`live/` + `worker.py`) on `livekit/agents` 1.6 (15k★, Nov 2026) and LiveKit server (22k★, Nov 2026) |
| 6 Report | `sliday/resume-job-matcher` (275★, Aug 2026) | **none** → ideas only | Quote-first scoring; every score cites evidence |
| 4 Jobs / scoring | `chamals3n4/OpenATS` (45★, Nov 2026) | Apache-2.0 | Per-job scoring weights, applicant views (same stack) |
| 1–2 Challenges | `CTFd/CTFd` (6.9k★, Nov 2026) | Apache-2.0 | Challenge → submission → deadline → judging model |
| 2 Reward UX | `algora-io/algora` (1.5k★, Jul 2026) | AGPL → ideas only | How bounty rewards are displayed |

**Later, not in these 3 days:** more Indian languages for voice, Indic speech with `sarvamai/sarvam-ai-cookbook`, UPI payments with `razorpay/razorpay-node`, LLM tracing with `langfuse/langfuse`.

**New dependencies:** only the three LiveKit npm packages (Module 5), plus the Python `voice-agent/` sidecar with its own `pyproject.toml` (`livekit-agents` 1.6 + `livekit-plugins-google` for Gemini Live).

## 8. Demo story (~5 min)

1. Admin approves "Sharma Sweets".
2. The owner posts the challenge "Our Instagram gets no customers", reward ₹2,000, and uses "Make it clearer with AI".
3. Three students submit. The owner sees them ranked with reasons, picks Priya, and marks the reward paid.
4. Priya's My Proof now shows a 🟢 Verified card.
5. The owner posts a "Social Media Intern" job. AI suggests a pipeline with an AI Interview stage.
6. Priya and Rahul apply with proof cards. The owner shortlists both and clicks **Send AI interview**.
7. Priya does the chat interview on her phone.
8. The owner opens the report (🟢 Strong fit, scores with quotes) and moves her to the live Meet interview, then hires her.

## 9. Three-day schedule

| Day | Morning | Afternoon / evening |
|---|---|---|
| **1** | Module 0 (migration, LLM check) | Module 1 (post and submit challenges) |
| **2** | Module 2 (judging, reward) + Module 3 (proof cards) | Module 5 (AI interview **chat**) |
| **3** | Module 6 (report) + Module 4 (apply with proof) | Module 5 **voice** (LiveKit sidecar) → Module 7 (nav, phone check, demo seed, 2 rehearsals) |

**Voice checkpoint:** if voice isn't working reliably by **Day 3, 4 pm**, it ships behind its flag as "beta" and the demo uses chat. The report is identical either way.

**Cut order if late:** optional apply task → voice mode (keep as beta) → runner-up placement → dashboard cards. The demo story must still work.

**Each module ships with:** tests in `tests/*.test.ts` (Vitest, LLM stubbed as in the existing tests), a plan file in `plan/`, CHANGELOG/DECISIONS updates, and a local git commit (the repo's own rules).

## 10. Before building — needs you

1. **Start Docker Desktop.** Postgres isn't reachable right now, so tests and the app can't run.
2. **Turn the LLM back on.** `.env` currently has `LLM_PROVIDER=disabled` with an empty model and URL. To restore the earlier working setup, set `LLM_PROVIDER=openai`, `LLM_BASE_URL=https://ollama.com/v1`, `LLM_MODEL=gemma4:31b`, plus your key. Or give me another OpenAI-compatible key.

3. ~~Voice provider~~ **Done:** Gemini Live key set in `.env` (`GOOGLE_API_KEY`, model `gemini-3.8-live`). LiveKit runs locally in Docker, so it needs no account.

## 11. Defaults I'm using (change any before approving)

- Money rewards are paid outside the app and only recorded as "paid".
- The AI interview is chat or voice (student's choice): 6 questions, max 1 follow-up each, the link is valid 3 days, one attempt. Only transcripts are stored, never audio.
- Proof is required to apply: at least one proof card **or** a resume.
- The 🔵 "Checked" badge doesn't read link content (no scraping); it only checks that the link opens and that the description fits the skills.
- Hiring managers don't see AI reports; only the MSME owner does.
