
# Hiring board and AI interview, made proper

Status: in-progress
Date: 2026-11-12

## Objective

The user said the AI interview and the hiring process are "not good" after trying v2 (`plan/2026-11-12-venturepath-v2.md`). Make both simple and professional for an MSME owner with no HR team, and for a student on a phone, without changing the product rules in `docs/PRODUCT.md` §3 (human decides, students never see scores, no video/face analysis, works with AI off).

## User decisions (2026-11-12)

| # | Decision |
|---|----------|
| D1 | Build this plan as written. |
| D2 | Final step: the owner sends an offer (message, stipend, start date); the student accepts or declines in the app; accepted = Hired. |
| D3 | No automatic pipeline on new jobs: the owner chooses, with a one-click "Use recommended steps" (AI interview → Live interview). Offer is the final step after the last pipeline stage, not a stage kind. |

## Problems found (screenshots from the e2e run + code)

**Hiring (owner, applicants page)**
- H1. One long scroll: each applicant is split into three separate cards (applicant, AI interview, AI screening), so candidates can't be scanned or compared.
- H2. No overview of who is where. The stage is a tiny chip; a four-dropdown filter bar with an "Apply filters" button does the job of a board.
- H3. Conflicting actions: Accept/Reject on the applicant card *and* Move/Reject on the report. Accept skips every stage (hire with no interview).
- H4. A job has no hiring steps unless the owner builds a pipeline in the listing editor, so AI interview is invisible by default.
- H5. "Send AI interview" needs hard-to-find checkboxes; live-interview scheduling is hidden in a collapsed "Pipeline & scheduling".
- H6. No real final step: "Accept" = hired, with no offer message, stipend or start date, and the student can't accept or decline.
- H7. Noise: "AI interview · AI interview" titles, "AI screening is not configured" cards, model names.

**AI interview (student)**
- S1. Looks like a form inside the public website (site header, footer, small card), not an interview room.
- S2. No "before you start" page (what to expect, time, tips, mic check for voice); progress is only "Question 1 of 6".
- S3. 3–10 s waits per answer with a disabled button only; no typing indicator, no Enter-to-send.
- S4. Generic questions ("What skills would you bring to the role?").
- S5. Voice never tried in a real browser.

**AI interview report (owner)**
- R1. Lenient scoring: the e2e report gave 5/5 on every skill. No anchored rubric.
- R2. No per-question view (question → answer → score) and no single interview score to compare candidates.
- R3. Reports fail when Gemini is busy or out of quota; one attempt, then a "couldn't be written" box.
- R4. Recommendation isn't visible in the list, so comparing means scrolling.

## Plan

### Part 1 — Hiring board (owner)
1. **Recommended steps in one click** (D3). Jobs without steps show "Use recommended steps" (AI interview → Live interview), on the board and in the listing editor; the owner can still edit or skip them.
2. **Board instead of a long list** (`/organisation/opportunities/[id]/applicants`): stage tabs with counts — Applied · AI interview · Live interview · Offer · Hired · Not selected. Each candidate is one compact row: name, best proof badge, AI screening score, AI interview result (🟢/🟡/🔴 + score), and **one** "next step" button. Search by name + sort (best match / newest). Works as tabs on a phone.
3. **Candidate page** (`…/applicants/[applicationId]`): everything about one candidate in one place — proof cards, AI screening, AI interview report, live interview (schedule + interviewer feedback), timeline of moves — with one clear action bar: "Move to <next step>" and "Not selected" (with an optional reason sent kindly). "Previous / Next candidate" to review quickly.
4. **One action model.** No Accept that skips steps. The final step is **Make offer**: message, stipend, start date → the student sees it in My Applications and taps **Accept** or **Decline** → Hired. (Schema: offer fields on `Application`; migration.)
5. **Bulk from the Applied tab:** select → "Send AI interview" / "Not selected".
6. Live interview scheduling shown directly on the candidate page when they're at that step (existing Google Meet logic).

### Part 2 — AI interview room (student)
1. Focused full-screen layout (no site nav/footer), VenturePath + business name only.
2. **Before you start** page: role and business, "6 questions · about 15 minutes · one attempt", tips (answer with real examples, it's fine to write in simple English or Hinglish), choose 💬 Chat or 🎤 Voice, a **mic check** for voice, consent.
3. Real chat: bubbles, progress bar (1–6), "Interviewer is thinking…" typing indicator, Enter to send (Shift+Enter for new line), auto-scroll, phone-keyboard safe, autosaved draft.
4. Better questions: opening question tied to the actual business and role; proof questions name the student's proof card; a realistic small-business situation; follow-ups only when an answer is vague (max 1, unchanged).
5. Clear finish screen: "Submitted — Sharma Sweets will get back to you", what happens next.
6. Voice: run with a real mic in the browser; fix what breaks. (Needs you to speak for one test.)

### Part 3 — Report (owner)
1. **Anchored rubric** per skill (0 = no evidence … 5 = specific, repeated, real evidence) in the prompt, plus a calibration rule so generic answers can't score 5. Overall interview score /100 computed in code from the skill scores.
2. **Per-question view:** each question with the answer, a 0–5 score and one-line reason, follow-up shown under it.
3. Summary on top: recommendation (advice only), score, 2–3 strengths, 2–3 things to check in the live interview, integrity flags.
4. **Compare** (from the board): pick 2–4 candidates → side-by-side scores, recommendation, strengths and concerns.
5. **Reliability:** background retries with backoff (3 attempts over ~2 minutes, using the fallback model) before showing "failed"; "Retry" stays.

### Part 4 — Verify
- Update `e2e/demo-story.spec.ts` for the board, candidate page, offer accept, new interview room; Vitest for offer rules, rubric/score maths, retries.
- Run the full demo live once (quota permitting) and refresh the screenshots.
- Docs: PRODUCT.md (Modules 5–6 + hiring), CHANGELOG, ADRs.

## Build approach

Same as v2: one small migration first (offer fields), then three parallel agents — Part 1 (hiring board + offer), Part 2 (interview room), Part 3 (report) — then an end-to-end agent for Part 4. Estimated: about one working day.

## Risks

- Gemini free-tier quota (≈20 requests/day/model) still limits live testing; a billing-enabled key is strongly recommended.
- Changing "Accept" behaviour affects existing e2e tests and hiring-manager flows (ADR-036/037); they'll be updated, not dropped.
- Voice needs a human test with a real microphone.
