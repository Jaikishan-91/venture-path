import "server-only";
import { runInBackground } from "./background";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { asData } from "./llm/json";
import { buildPrompt, getPromptContent } from "./llm/prompts";
import { createLlmClient, type LlmClient } from "./llm/provider";
import {
  applyEvidenceRules,
  computeRecommendation,
  INTERVIEW_DATA_SYSTEM_MESSAGE,
  parseEvidence,
  parseReport,
  quotesByQuestion,
  readQuestions,
  readTranscript,
  reportSkills,
} from "./ai-interview-schemas";
import {
  REPORT_RETRY_DELAYS_MS,
  type InterviewQuestion,
  type InterviewReport,
  type TranscriptTurn,
} from "./v2/types";

/**
 * AI interview report (docs/PRODUCT.md Module 6), the same for chat and voice. Two passes:
 * A (`interview_evidence`) copies the student's own sentences per skill; B (`interview_report`)
 * scores each skill and each question 0–5 against an anchored rubric, from those quotes only.
 * Quotes not found in the student's answers are dropped, and a skill without quotes or an
 * unanswered question scores 0 in code. The 0–100 score (`interviewScore`) and the
 * recommendation (`computeRecommendation`) are computed in code. Never moves or rejects a
 * candidate.
 *
 * Reliability: an LLM failure or an invalid reply is retried in the background after
 * `REPORT_RETRY_DELAYS_MS` (3 attempts in all, counted in `reportAttempts`) before `failed`.
 */

const MAX_TRANSCRIPT_CHARS = 24_000;
const MAX_EVIDENCE_CHARS = 14_000;
/** A report stuck in `pending` this long (e.g. the server restarted) may be claimed again. */
export const STALE_PENDING_MS = 5 * 60 * 1000;

export type ReportRunOptions = {
  now?: Date;
  /** Delays between attempts; defaults to `REPORT_RETRY_DELAYS_MS` (or the env override). */
  retryDelaysMs?: readonly number[];
  /** Injectable wait, so tests don't sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Count attempts from zero even when reclaiming a stale `pending` (manual "Retry report"). */
  resetAttempts?: boolean;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry delays: `REPORT_RETRY_DELAYS_MS` from v2/types, unless the env var of the same name
 * holds a comma-separated list of milliseconds (tests set "0,0"; ops can tune it).
 */
function defaultRetryDelays(): readonly number[] {
  const raw = process.env.REPORT_RETRY_DELAYS_MS?.trim();
  if (!raw) return REPORT_RETRY_DELAYS_MS;
  const delays = raw.split(",").map((part) => Number(part.trim()));
  return delays.every((delay) => Number.isFinite(delay) && delay >= 0)
    ? delays
    : REPORT_RETRY_DELAYS_MS;
}

/** Start the report in the background. Idempotent; ignores sessions that aren't completed. */
export function startInterviewReport(sessionId: string, options: ReportRunOptions = {}): void {
  runInBackground("AI interview report", { sessionId }, () =>
    generateInterviewReport(sessionId, options),
  );
}

type AttemptResult =
  | { ok: true; report: InterviewReport }
  /** `final`: retrying can't help (nothing to score). */
  | { ok: false; why: string; final: boolean };

/**
 * Generate and store the report. Claims the session first (`reportStatus` → pending, guarded on
 * the row's previous state and `updatedAt`), so concurrent calls and finished reports are
 * no-ops; a stale `pending` (the server restarted mid-run) is reclaimed and continues its attempt
 * count unless `resetAttempts`. Returns the final status, or null when nothing was done.
 */
export async function generateInterviewReport(
  sessionId: string,
  options: ReportRunOptions = {},
): Promise<"done" | "failed" | null> {
  const now = options.now ?? new Date();
  const delays = options.retryDelaysMs ?? defaultRetryDelays();
  const sleep = options.sleep ?? realSleep;
  const maxAttempts = delays.length + 1;
  const db = getDb();
  const logger = getLogger();

  const row = await db.interviewSession.findUnique({
    where: { id: sessionId },
    select: { status: true, reportStatus: true, reportAttempts: true, updatedAt: true },
  });
  if (!row || row.status !== "completed") return null;
  const stale =
    row.reportStatus === "pending" && row.updatedAt.getTime() < now.getTime() - STALE_PENDING_MS;
  if (row.reportStatus === "done" || (row.reportStatus === "pending" && !stale)) return null;
  let attempts = stale && !options.resetAttempts ? row.reportAttempts : 0;

  const { count } = await db.interviewSession.updateMany({
    where: {
      id: sessionId,
      status: "completed",
      reportStatus: row.reportStatus,
      updatedAt: row.updatedAt,
    },
    data: { reportStatus: "pending", reportAttempts: attempts },
  });
  if (count === 0) return null;

  const fail = async (why: string) => {
    logger.warn({ sessionId, why, attempts }, "AI interview report failed");
    await db.interviewSession.update({
      where: { id: sessionId },
      data: { reportStatus: "failed" },
    });
    return "failed" as const;
  };

  const client = createLlmClient();
  if (!client) return fail("no_llm");

  while (attempts < maxAttempts) {
    attempts += 1;
    // Also refreshes `updatedAt`, so a running report never looks stale.
    await db.interviewSession.update({
      where: { id: sessionId },
      data: { reportAttempts: attempts },
    });
    const result = await attemptReport(sessionId, client);
    if (result.ok) {
      const recommendation = computeRecommendation(
        result.report.skills.map((entry) => entry.score),
      );
      await db.interviewSession.update({
        where: { id: sessionId },
        data: {
          report: result.report,
          reportStatus: "done",
          recommendation,
          reportModel: client.model,
        },
      });
      logger.info(
        { sessionId, recommendation, model: client.model, attempts },
        "AI interview report done",
      );
      return "done";
    }
    if (result.final || attempts >= maxAttempts) return fail(result.why);
    const delay = delays[attempts - 1] ?? 0;
    logger.info({ sessionId, why: result.why, attempts, delay }, "AI interview report retry");
    await sleep(delay);
  }
  // Reclaimed a stale run whose attempts were already used up.
  return fail("attempts_exhausted");
}

/** One run of both passes. */
async function attemptReport(sessionId: string, client: LlmClient): Promise<AttemptResult> {
  const session = await getDb().interviewSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      questions: true,
      transcript: true,
      application: { select: { opportunity: { select: { title: true } } } },
    },
  });
  const questions = readQuestions(session.questions);
  const transcript = readTranscript(session.transcript);
  const studentTurns = transcript.filter((turn) => turn.role === "student");
  const studentTexts = studentTurns.map((turn) => turn.text);
  if (studentTexts.length === 0) return { ok: false, why: "empty_transcript", final: true };
  const skills = reportSkills(questions);
  const title = session.application.opportunity.title;

  // Pass A: student turns only, each labelled with the question it answers.
  const questionText = new Map(questions.map((question) => [question.id, question.text]));
  const transcriptText = studentTurns
    .map(
      (turn) =>
        `Question: ${questionText.get(turn.questionId) ?? "-"}\n` +
        `Student${turn.followUp ? " (follow-up answer)" : ""}: ${turn.text}`,
    )
    .join("\n\n");
  const evidencePrompt = buildPrompt(await getPromptContent("interview_evidence"), {
    title,
    skills: skills.join(", "),
    transcript: asData("transcript", transcriptText, MAX_TRANSCRIPT_CHARS),
  });
  const evidenceReply = await client.chat([
    { role: "system", content: INTERVIEW_DATA_SYSTEM_MESSAGE },
    { role: "user", content: evidencePrompt },
  ]);
  if (!evidenceReply) return { ok: false, why: "evidence_llm", final: false };
  const evidence = parseEvidence(evidenceReply, skills, studentTexts);
  if (!evidence) return { ok: false, why: "evidence_parse", final: false };

  // Pass B: scores from the verified quotes only, by skill and by question.
  const reportPrompt = buildPrompt(await getPromptContent("interview_report"), {
    title,
    evidence: asData(
      "evidence",
      evidenceForScoring(evidence, questions, transcript),
      MAX_EVIDENCE_CHARS,
    ),
  });
  const reportReply = await client.chat([
    { role: "system", content: INTERVIEW_DATA_SYSTEM_MESSAGE },
    { role: "user", content: reportPrompt },
  ]);
  if (!reportReply) return { ok: false, why: "report_llm", final: false };
  const questionIds = questions.map((question) => question.id);
  const parsed = parseReport(reportReply, skills, studentTexts, questionIds);
  if (!parsed) return { ok: false, why: "report_parse", final: false };
  const answered = new Set(studentTurns.map((turn) => turn.questionId));
  return { ok: true, report: applyEvidenceRules(parsed, evidence, answered) };
}

/** The Pass B evidence block: verified quotes per skill, then the same quotes per question. */
function evidenceForScoring(
  evidence: { skill: string; quotes: string[] }[],
  questions: InterviewQuestion[],
  transcript: TranscriptTurn[],
): string {
  const list = (quotes: string[]) =>
    quotes.length > 0 ? quotes.map((quote) => `- "${quote}"`).join("\n") : "- (no quotes)";
  const byQuestion = quotesByQuestion(evidence, questions, transcript);
  const answered = new Set(
    transcript.filter((turn) => turn.role === "student").map((turn) => turn.questionId),
  );
  return [
    "SKILLS",
    ...evidence.map((entry) => `Skill: ${entry.skill}\n${list(entry.quotes)}`),
    "QUESTIONS",
    ...questions.map(
      (question) =>
        `Question ${question.id} (${question.kind}, skill: ${question.skill ?? "-"}): ${question.text}\n` +
        (answered.has(question.id) ? list(byQuestion.get(question.id) ?? []) : "- (not answered)"),
    ),
  ].join("\n\n");
}
