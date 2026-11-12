/**
 * Shared contract for VenturePath v2 (docs/PRODUCT.md, plan `plan/2026-11-12-venturepath-v2.md`).
 * Built in parallel by four work packages; each owns its files, and this file is how they meet.
 * Types and limits only, so it is safe to import from client and server code.
 *
 *  WP-A Challenges   (Modules 1–2): src/lib/challenges.ts, challenge-*.ts, /challenges, /organisation/challenges
 *  WP-B Proof        (Modules 3–4): src/lib/proofs.ts, proof-*.ts, /user/proof, apply-with-proof
 *  WP-C AI interview (Modules 5–6): src/lib/ai-interview*.ts, /interview/[token], report panel
 *  WP-D Voice        (Module 5 voice): voice-agent/ (Python), /api/voice-agent/*, livekit-token route, VoiceRoom
 *
 * Ownership rules that avoid cross-package edits:
 *  - Proof rows with source = "challenge" are written ONLY by WP-A (created on submit, level → "verified"
 *    when placed winner/runner-up). WP-B writes manual and apply_task proofs and runs the AI check on
 *    manual ones only. Everyone may read Proof.
 *  - Emails are built inside each package's own lib file and sent with `sendEmail` (src/lib/email.ts
 *    is not edited).
 *  - Prompt defaults: each package edits only its own file in src/lib/llm/defaults-v2/.
 *  - Navigation (app-sidebar.tsx), dashboards and shared docs (CHANGELOG, DECISIONS, ROADMAP) are
 *    done at merge time, not by packages.
 *  - The Prisma schema is fixed by migration `venturepath_v2_challenges_proof_interview`. Packages
 *    don't create migrations; a needed schema change is reported back instead.
 */

export type { Ok, Fail, Result } from "../hiring/types";

// ---------------------------------------------------------------------------------------------
// WP-A Challenges
// ---------------------------------------------------------------------------------------------

export const MAX_CHALLENGE_TITLE_LENGTH = 120;
export const MAX_CHALLENGE_PROBLEM_LENGTH = 4000;
export const MAX_CHALLENGE_GOOD_SOLUTION_LENGTH = 2000;
export const MAX_CHALLENGE_CRITERIA = 3;
export const MAX_CRITERION_LENGTH = 200;
export const MAX_SUBMISSION_TEXT_LENGTH = 8000;
export const MAX_REWARD_INR = 10_00_000;
export const MAX_HIRE_MESSAGE_LENGTH = 1000;
/** Score scale for submissions (whole numbers). */
export const CHALLENGE_SCORE_MAX = 10;
/** Cosine similarity above which two submissions are flagged as near-identical. */
export const SIMILARITY_FLAG_THRESHOLD = 0.92;

export type ChallengeStatus = "draft" | "open" | "judging" | "done";
export const CHALLENGE_STATUS_LABELS: Record<ChallengeStatus, string> = {
  draft: "Draft",
  open: "Open",
  judging: "Judging",
  done: "Done",
};

export type ChallengePlacement = "none" | "winner" | "runner_up";
export type RewardStatus = "none" | "paid" | "hire_offered";

/** One judging point's AI score, stored in ChallengeSubmission.aiBreakdown. */
export type CriterionScore = { criterion: string; score: number; quote: string };

export type ChallengeFailure =
  | "not_found"
  | "not_approved"
  | "invalid"
  /** Neither money nor hire reward. */
  | "no_reward"
  | "deadline_passed"
  | "wrong_status"
  /** A money reward must be marked paid before the challenge is done. */
  | "reward_unpaid";

// ---------------------------------------------------------------------------------------------
// WP-B Proof cards
// ---------------------------------------------------------------------------------------------

export const MAX_MANUAL_PROOFS = 10;
export const MAX_PROOF_TITLE_LENGTH = 120;
export const MAX_PROOF_WHAT_I_DID_LENGTH = 600;
export const MAX_PROOF_SKILLS = 8;
/** Proof cards a student can attach to one job application. */
export const MAX_APPLICATION_PROOFS = 3;
export const MAX_APPLY_TASK_LENGTH = 2000;
export const MAX_APPLY_TASK_ANSWER_LENGTH = 8000;

export type ProofSource = "manual" | "challenge" | "apply_task";
export type ProofLevel = "added" | "checked" | "verified";

export const PROOF_LEVEL_LABELS: Record<ProofLevel, string> = {
  added: "Added",
  checked: "Checked",
  verified: "Verified by business",
};
/** Strongest first; use to sort proof cards for organisations. */
export const PROOF_LEVEL_RANK: Record<ProofLevel, number> = { verified: 0, checked: 1, added: 2 };

export type ProofFailure = "not_found" | "invalid" | "too_many" | "locked";

// ---------------------------------------------------------------------------------------------
// WP-C AI interview (chat) + report
// ---------------------------------------------------------------------------------------------

export const INTERVIEW_QUESTION_COUNT = 6;
export const MAX_FOLLOW_UPS_PER_QUESTION = 1;
export const MAX_INTERVIEW_ANSWER_LENGTH = 1500;
export const INTERVIEW_INVITE_TTL_DAYS = 3;
/** Soft limit shown to the student. */
export const INTERVIEW_TARGET_MINUTES = 20;

export type InterviewQuestionKind = "skill" | "proof" | "situation" | "motivation";
/** Stored in InterviewSession.questions. */
export type InterviewQuestion = {
  id: string;
  text: string;
  kind: InterviewQuestionKind;
  /** Skill this question probes (report groups scores by it). */
  skill?: string;
};

/** Stored in InterviewSession.transcript (array, in order). */
export type TranscriptTurn = {
  role: "ai" | "student";
  text: string;
  questionId: string;
  followUp?: boolean;
  /** Student turns only: the text was pasted (chat) — shown as a flag, never a reason to reject. */
  pasted?: boolean;
  /** ISO timestamp. */
  at: string;
};

/** Stored in InterviewSession.report. Scores 0–5; quotes are the student's own words. */
export type InterviewReport = {
  skills: { skill: string; score: number; quote: string }[];
  strengths: string[];
  concerns: string[];
  summary: string;
  /**
   * Per-question view (plan 2026-11-12-hiring-and-ai-interview-v2, Part 3). Optional so reports
   * written before it still render. `score` 0–5 against the anchored rubric; `reason` one line.
   */
  questions?: { questionId: string; score: number; reason: string }[];
};

/**
 * Interview score 0–100 from the skill scores (0–5), computed in code so every screen agrees.
 * Null when there are no scores. Pure; safe on the client.
 */
export function interviewScore(report: Pick<InterviewReport, "skills"> | null): number | null {
  const scores = report?.skills.map((skill) => skill.score) ?? [];
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length / 5) * 100);
}

export type InterviewRecommendation = "strong" | "maybe" | "not_fit";
export const INTERVIEW_RECOMMENDATION_LABELS: Record<InterviewRecommendation, string> = {
  strong: "Strong fit",
  maybe: "Maybe",
  not_fit: "Not a fit",
};

export type InterviewFailure =
  "not_found" | "expired" | "already_completed" | "no_consent" | "invalid" | "stale";

// ---------------------------------------------------------------------------------------------
// WP-D Voice (contract between the Next.js app and the Python voice-agent/)
// ---------------------------------------------------------------------------------------------

/** LiveKit agent name the worker registers; rooms dispatch it explicitly. */
export const VOICE_AGENT_NAME = "venturepath-interviewer";
/** Room name for a session. Room metadata is JSON `VoiceRoomMetadata`. */
export const voiceRoomName = (sessionId: string) => `vp-interview-${sessionId}`;
export type VoiceRoomMetadata = { sessionId: string };

/** Header the voice agent sends; value = env VOICE_AGENT_SHARED_SECRET. */
export const VOICE_AGENT_SECRET_HEADER = "x-voice-agent-secret";

/**
 * GET /api/voice-agent/sessions/[sessionId]/plan → VoicePlan (404 unless status in_progress, mode voice).
 * The agent speaks only these questions, in order, starting at `currentIndex`, with at most
 * `maxFollowUpsPerQuestion` follow-ups each. It never scores.
 */
export type VoicePlan = {
  sessionId: string;
  listingTitle: string;
  businessName: string;
  studentFirstName: string;
  questions: Pick<InterviewQuestion, "id" | "text">[];
  currentIndex: number;
  maxFollowUpsPerQuestion: number;
  /** BCP-47, e.g. "en-IN". */
  language: string;
};

/**
 * POST /api/voice-agent/sessions/[sessionId]/transcript with body VoiceTranscriptPost.
 * Turns are appended (idempotent by `seq`); `completed: true` finishes the session and starts the
 * report (same report as chat). Responds `{ ok: true }`.
 */
export type VoiceTranscriptPost = {
  /** Monotonic per session, starting at 0; the server ignores turns it already has. */
  seq: number;
  turns: TranscriptTurn[];
  currentIndex: number;
  completed: boolean;
};

/**
 * POST /api/interview/[token]/livekit-token (student browser, after consent with mode voice)
 * → VoiceJoin. 404 when voice is disabled (VOICE_INTERVIEW_ENABLED != "true").
 */
export type VoiceJoin = { url: string; token: string; roomName: string };

/**
 * Cross-package functions (wired together at merge):
 *  - WP-C exports from `src/lib/ai-interview.ts`:
 *      findSessionByToken(token: string) — hashes the token (SHA-256 hex) and loads the session.
 *  - WP-C exports from `src/lib/ai-interview-report.ts`:
 *      startInterviewReport(sessionId: string): void — runs the report in the background
 *      (same for chat and voice). Idempotent; ignores sessions that aren't completed.
 *  - WP-D owns `src/lib/ai-interview-voice.ts` (DB-level, no dependency on WP-C files):
 *      getVoicePlan(sessionId: string): Promise<VoicePlan | null>
 *      recordVoiceTranscript(sessionId: string, post: VoiceTranscriptPost): Promise<Result<object, InterviewFailure>>
 *    On `completed: true` it marks the session completed; the call to `startInterviewReport`
 *    is added at merge (marked `// MERGE: startInterviewReport`).
 *  - `src/components/interview/voice-room.tsx` exports
 *      VoiceRoom(props: { token: string; onSwitchToChat: () => void })
 *    WP-C creates a placeholder; WP-D's real component replaces it at merge.
 */

// ---------------------------------------------------------------------------------------------
// Hiring board, candidate page and offer (plan 2026-11-12-hiring-and-ai-interview-v2)
//  WP-F Hiring board + offer: applicants board/candidate page, src/lib/hiring-board.ts, src/lib/offers.ts,
//       pipeline-progress last-stage behaviour, "Use recommended steps", student offer accept/decline.
//  WP-G Interview room (student): src/app/interview/**, question/follow-up prompts, student-side ai-interview.ts.
//  WP-H Report: ai-interview-report*.ts, evidence/report prompts, components/hiring/ai-interview-report.tsx,
//       compare page `src/app/organisation/opportunities/[id]/applicants/compare/` (owned by WP-H).
// The report component keeps its props: AiInterviewReport({ interview, actions?, retry?, aiAvailable? }).
// ---------------------------------------------------------------------------------------------

/**
 * Board tabs. A pipeline stage id is its own tab between "applied" and "offer".
 *  applied      submitted, currentStageId null, no offer
 *  <stageId>    submitted, at that pipeline stage, no offer
 *  offer        submitted, offerStatus pending or declined
 *  hired        status accepted
 *  not_selected status rejected (withdrawn applications are not shown on the board)
 */
export type BoardTab = "applied" | "offer" | "hired" | "not_selected" | { stageId: string };

export const MAX_OFFER_MESSAGE_LENGTH = 2000;
export const MAX_NOT_SELECTED_REASON_LENGTH = 500;
export const MAX_OFFER_STIPEND_INR = 10_00_000;
/** Candidates the compare view takes at once. */
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;

export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn";
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: "Offer sent",
  accepted: "Offer accepted",
  declined: "Offer declined",
  withdrawn: "Offer withdrawn",
};

export type OfferFailure =
  | "not_found"
  | "invalid"
  /** Not at the last pipeline stage (or the listing has stages and the candidate is still at Applied). */
  | "not_ready"
  /** An offer is already pending, or the application is decided. */
  | "wrong_state"
  | "stale";

/** "Use recommended steps" (D3): created only when the listing has no stages. */
export const RECOMMENDED_STAGES = [
  {
    name: "AI interview",
    kind: "ai_interview",
    instructions: "A short chat or voice interview with our AI assistant, about 15 minutes.",
    durationMinutes: null,
  },
  {
    name: "Live interview",
    kind: "interview",
    instructions: "A short video call with the team.",
    durationMinutes: 30,
  },
] as const;

/** Report retries before "failed" (WP-H): delays in ms after attempt 1 and 2. */
export const REPORT_RETRY_DELAYS_MS = [20_000, 60_000] as const;
