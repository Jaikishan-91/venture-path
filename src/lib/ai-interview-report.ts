import "server-only";
import { runInBackground } from "./background";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { asData } from "./llm/json";
import { buildPrompt, getPromptContent } from "./llm/prompts";
import { createLlmClient } from "./llm/provider";
import {
  computeRecommendation,
  INTERVIEW_DATA_SYSTEM_MESSAGE,
  parseEvidence,
  parseReport,
  readQuestions,
  readTranscript,
  reportSkills,
} from "./ai-interview-schemas";

/**
 * AI interview report (docs/PRODUCT.md Module 6), the same for chat and voice. Two passes:
 * A (`interview_evidence`) copies the student's own sentences per skill; B (`interview_report`)
 * scores each skill 0–5 from those quotes only. Quotes not found in the student's answers are
 * dropped. The recommendation is computed in code (`computeRecommendation`). Never moves or
 * rejects a candidate.
 */

const MAX_TRANSCRIPT_CHARS = 24_000;
const MAX_EVIDENCE_CHARS = 12_000;
/** A report stuck in `pending` this long (e.g. the server restarted) may be claimed again. */
const STALE_PENDING_MS = 5 * 60 * 1000;

/** Start the report in the background. Idempotent; ignores sessions that aren't completed. */
export function startInterviewReport(sessionId: string): void {
  runInBackground("AI interview report", { sessionId }, () => generateInterviewReport(sessionId));
}

/**
 * Generate and store the report. Claims the session first (`reportStatus` → pending), so
 * concurrent calls and finished reports are no-ops. Returns the final status, or null when
 * nothing was done.
 */
export async function generateInterviewReport(
  sessionId: string,
  now = new Date(),
): Promise<"done" | "failed" | null> {
  const db = getDb();
  const logger = getLogger();
  const { count } = await db.interviewSession.updateMany({
    where: {
      id: sessionId,
      status: "completed",
      OR: [
        { reportStatus: null },
        { reportStatus: "failed" },
        { reportStatus: "pending", updatedAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) } },
      ],
    },
    data: { reportStatus: "pending" },
  });
  if (count === 0) return null;

  const fail = async (why: string) => {
    logger.warn({ sessionId, why }, "AI interview report failed");
    await db.interviewSession.update({
      where: { id: sessionId },
      data: { reportStatus: "failed" },
    });
    return "failed" as const;
  };

  const session = await db.interviewSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      questions: true,
      transcript: true,
      application: { select: { opportunity: { select: { title: true } } } },
    },
  });
  const client = createLlmClient();
  if (!client) return fail("no_llm");

  const questions = readQuestions(session.questions);
  const transcript = readTranscript(session.transcript);
  const studentTexts = transcript
    .filter((turn) => turn.role === "student")
    .map((turn) => turn.text);
  if (studentTexts.length === 0) return fail("empty_transcript");
  const skills = reportSkills(questions);
  const title = session.application.opportunity.title;

  // Pass A: student turns only, each labelled with the question it answers.
  const questionText = new Map(questions.map((question) => [question.id, question.text]));
  const transcriptText = transcript
    .filter((turn) => turn.role === "student")
    .map((turn) => `Question: ${questionText.get(turn.questionId) ?? "-"}\nStudent: ${turn.text}`)
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
  const evidence = evidenceReply ? parseEvidence(evidenceReply, skills, studentTexts) : null;
  if (!evidence) return fail("evidence_parse");

  // Pass B: scores from the quotes only.
  const evidenceText = evidence
    .map(
      (entry) =>
        `Skill: ${entry.skill}\n` +
        (entry.quotes.length > 0
          ? entry.quotes.map((quote) => `- "${quote}"`).join("\n")
          : "- (no quotes)"),
    )
    .join("\n\n");
  const reportPrompt = buildPrompt(await getPromptContent("interview_report"), {
    title,
    evidence: asData("evidence", evidenceText, MAX_EVIDENCE_CHARS),
  });
  const reportReply = await client.chat([
    { role: "system", content: INTERVIEW_DATA_SYSTEM_MESSAGE },
    { role: "user", content: reportPrompt },
  ]);
  const report = reportReply ? parseReport(reportReply, skills, studentTexts) : null;
  if (!report) return fail("report_parse");

  const recommendation = computeRecommendation(report.skills.map((entry) => entry.score));
  await db.interviewSession.update({
    where: { id: sessionId },
    data: { report, reportStatus: "done", recommendation, reportModel: client.model },
  });
  logger.info({ sessionId, recommendation, model: client.model }, "AI interview report done");
  return "done";
}
