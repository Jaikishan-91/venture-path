import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { runInBackground } from "./background";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import { asData } from "./llm/json";
import { buildPrompt, getPromptContent } from "./llm/prompts";
import { createLlmClient, type LlmClient } from "./llm/provider";
import { startInterviewReport } from "./ai-interview-report";
import {
  answerInputSchema,
  fallbackQuestions,
  INTERVIEW_DATA_SYSTEM_MESSAGE,
  parseFollowUp,
  parseQuestionPlan,
  readQuestions,
  readTranscript,
  startInputSchema,
  type ProofForPlan,
} from "./ai-interview-schemas";
import {
  INTERVIEW_INVITE_TTL_DAYS,
  INTERVIEW_QUESTION_COUNT,
  MAX_FOLLOW_UPS_PER_QUESTION,
  MAX_INTERVIEW_ANSWER_LENGTH,
  type InterviewFailure,
  type InterviewQuestion,
  type InterviewRecommendation,
  type InterviewReport,
  type Result,
  type TranscriptTurn,
} from "./v2/types";

/**
 * AI interviewer, chat channel and session state (docs/PRODUCT.md Module 5). One
 * `InterviewSession` per application + `ai_interview` stage, opened when the organisation moves a
 * candidate there (`pipeline-progress.ts`). The invite link carries 32 random bytes; only their
 * SHA-256 is stored (like hiring-manager invites, ADR-036). The AI never moves a candidate: the
 * organisation decides from the report (`ai-interview-report.ts`).
 */

type InterviewMode = "chat" | "voice";

const MAX_LISTING_CHARS = 6000;
const MAX_PROOFS_CHARS = 3000;
const MAX_PLAN_PROOFS = 5;
const MAX_BUSINESS_CHARS = 600;

type PlanBusiness = {
  businessName: string;
  industry: string;
  location: string;
  description: string;
};

export const hashInterviewToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Invite tokens are base64url (43 chars); anything else never reaches the database. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;
export const isInterviewTokenShape = (token: string) => TOKEN_PATTERN.test(token);

export const voiceInterviewEnabled = () => process.env.VOICE_INTERVIEW_ENABLED === "true";

const newExpiry = (now: Date) =>
  new Date(now.getTime() + INTERVIEW_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

const sessionInclude = {
  stage: { select: { id: true, name: true } },
  application: {
    select: {
      id: true,
      status: true,
      currentStageId: true,
      userProfile: { select: { userId: true, user: { select: { name: true, email: true } } } },
      opportunity: {
        select: {
          id: true,
          title: true,
          description: true,
          skills: true,
          requirements: true,
          organisationProfile: {
            select: { businessName: true, industry: true, location: true, description: true },
          },
        },
      },
    },
  },
} satisfies Prisma.InterviewSessionInclude;

export type LoadedInterviewSession = Prisma.InterviewSessionGetPayload<{
  include: typeof sessionInclude;
}>;

/**
 * Hashes the token (SHA-256 hex) and loads the session with its application, student and
 * listing, or null. Callers check ownership and status themselves (contract in `v2/types.ts`).
 */
export async function findSessionByToken(token: string): Promise<LoadedInterviewSession | null> {
  if (!isInterviewTokenShape(token)) return null;
  return getDb().interviewSession.findUnique({
    where: { tokenHash: hashInterviewToken(token) },
    include: sessionInclude,
  });
}

/** Expire this session if its link ran out or the candidate is no longer at its stage. */
async function settleStatus(
  session: LoadedInterviewSession,
  now: Date,
): Promise<LoadedInterviewSession["status"]> {
  if (session.status === "completed" || session.status === "expired") return session.status;
  const { application } = session;
  const leftStage =
    application.status !== "submitted" || application.currentStageId !== session.stageId;
  const linkExpired = session.status === "invited" && session.expiresAt <= now;
  if (!leftStage && !linkExpired) return session.status;
  await getDb().interviewSession.updateMany({
    where: { id: session.id, status: { in: ["invited", "in_progress"] } },
    data: { status: "expired" },
  });
  return "expired";
}

// ---------------------------------------------------------------------------------------------
// Invites (called from pipeline-progress.ts)
// ---------------------------------------------------------------------------------------------

async function proofsForApplication(applicationId: string): Promise<ProofForPlan[]> {
  const db = getDb();
  const select = { title: true, whatIDid: true, skills: true } as const;
  const attached = await db.proof.findMany({
    where: { applications: { some: { id: applicationId } } },
    select,
    orderBy: { updatedAt: "desc" },
    take: MAX_PLAN_PROOFS,
  });
  if (attached.length > 0) return attached;
  return db.proof.findMany({
    where: { userProfile: { applications: { some: { id: applicationId } } } },
    select,
    orderBy: { updatedAt: "desc" },
    take: MAX_PLAN_PROOFS,
  });
}

/**
 * Open (or re-issue) the interview for a candidate who just reached an `ai_interview` stage: a
 * new token and expiry with the fallback question bank, then — in the background — the AI
 * question plan and the invite email. A completed session for this stage is kept as is (one
 * attempt). Returns the raw token (for tests); it is only ever emailed.
 */
export async function openInterviewForStage(
  applicationId: string,
  stageId: string,
  now = new Date(),
): Promise<{ sessionId: string; token: string } | null> {
  const db = getDb();
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      opportunity: {
        select: {
          title: true,
          skills: true,
          organisationProfile: { select: { businessName: true } },
        },
      },
    },
  });
  if (!application) return null;
  const existing = await db.interviewSession.findUnique({
    where: { applicationId_stageId: { applicationId, stageId } },
    select: { id: true, status: true },
  });
  if (existing?.status === "completed") return null;

  const proofs = await proofsForApplication(applicationId);
  const questions = fallbackQuestions(
    {
      title: application.opportunity.title,
      skills: application.opportunity.skills,
      businessName: application.opportunity.organisationProfile.businessName,
    },
    proofs,
  );
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInterviewToken(token);
  const fresh = {
    tokenHash,
    status: "invited" as const,
    mode: null,
    expiresAt: newExpiry(now),
    consentedAt: null,
    questions,
    transcript: [],
    currentIndex: 0,
    pasteCount: 0,
    tabLeaveCount: 0,
    startedAt: null,
    completedAt: null,
  };
  const session = existing
    ? await db.interviewSession.update({
        where: { id: existing.id },
        data: fresh,
        select: { id: true },
      })
    : await db.interviewSession.create({
        data: { applicationId, stageId, ...fresh },
        select: { id: true },
      });

  getLogger().info({ applicationId, stageId, sessionId: session.id }, "AI interview opened");
  runInBackground("AI interview invite", { sessionId: session.id }, () =>
    prepareAndInvite(session.id, tokenHash, token),
  );
  return { sessionId: session.id, token };
}

/** Expire unfinished interviews of an application, except at `keepStageId` (the stage it is now at). */
export async function expireOpenInterviews(
  applicationId: string,
  keepStageId: string | null = null,
): Promise<void> {
  await getDb().interviewSession.updateMany({
    where: {
      applicationId,
      status: { in: ["invited", "in_progress"] },
      ...(keepStageId ? { stageId: { not: keepStageId } } : {}),
    },
    data: { status: "expired" },
  });
}

async function generateQuestionPlan(
  client: LlmClient,
  listing: {
    title: string;
    description: string;
    skills: string[];
    requirements: string | null;
    organisationProfile: PlanBusiness;
  },
  proofs: ProofForPlan[],
): Promise<InterviewQuestion[] | null> {
  const business = listing.organisationProfile;
  const listingText = [
    `Business: ${business.businessName} (${business.industry}, ${business.location})`,
    `About the business: ${business.description.slice(0, MAX_BUSINESS_CHARS)}`,
    `Title: ${listing.title}`,
    `Skills: ${listing.skills.join(", ") || "-"}`,
    `Description:\n${listing.description}`,
    `Requirements:\n${listing.requirements ?? "-"}`,
  ].join("\n");
  const proofsText =
    proofs.length === 0
      ? "The student has no proof cards."
      : proofs
          .map(
            (proof, index) =>
              `Proof ${index + 1}: ${proof.title}\nSkills: ${proof.skills.join(", ") || "-"}\nWhat they did: ${proof.whatIDid}`,
          )
          .join("\n\n");
  const prompt = buildPrompt(await getPromptContent("interview_questions"), {
    questionCount: String(INTERVIEW_QUESTION_COUNT),
    listing: asData("listing", listingText, MAX_LISTING_CHARS),
    proofs: asData("proofs", proofsText, MAX_PROOFS_CHARS),
  });
  const content = await client.chat([
    { role: "system", content: INTERVIEW_DATA_SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ]);
  if (!content) return null;
  const plan = parseQuestionPlan(content, listing.skills[0]);
  if (!plan) {
    getLogger().warn({ contentSample: content.slice(0, 200) }, "Failed to parse interview plan");
  }
  return plan;
}

/** Background: replace the fallback bank with the AI plan (if valid), then email the link. */
async function prepareAndInvite(sessionId: string, tokenHash: string, token: string) {
  const db = getDb();
  const logger = getLogger();
  const session = await db.interviewSession.findUnique({
    where: { id: sessionId },
    include: sessionInclude,
  });
  if (!session || session.tokenHash !== tokenHash || session.status !== "invited") return;
  const { opportunity, userProfile } = session.application;

  const client = createLlmClient();
  if (client) {
    const plan = await generateQuestionPlan(
      client,
      opportunity,
      await proofsForApplication(session.applicationId),
    );
    if (plan) {
      await db.interviewSession.updateMany({
        where: { id: sessionId, tokenHash, status: "invited" },
        data: { questions: plan },
      });
      logger.info({ sessionId, model: client.model }, "AI interview plan generated");
    }
  }

  const url = `${getEnv().BETTER_AUTH_URL}/interview/${token}`;
  const business = opportunity.organisationProfile.businessName;
  await sendEmail({
    to: userProfile.user.email,
    subject: `Your AI interview for ${opportunity.title}`,
    text:
      `Hi ${userProfile.user.name},\n\n${business} would like you to take a short AI interview for ${opportunity.title}.\n\n` +
      `An AI will ask you ${INTERVIEW_QUESTION_COUNT} questions about this role (about 15 minutes). You answer by typing${voiceInterviewEnabled() ? " or speaking" : ""}. ` +
      `${business} makes the final decision.\n\nStart here (one attempt, link valid for ${INTERVIEW_INVITE_TTL_DAYS} days):\n${url}\n\nIf you weren't expecting this, you can ignore this email.`,
  });
  logger.info({ sessionId }, "AI interview invite sent");
}

// ---------------------------------------------------------------------------------------------
// Student side (/interview/[token])
// ---------------------------------------------------------------------------------------------

type ViewBase = { listingTitle: string; businessName: string };
export type ChatTurnView = { role: TranscriptTurn["role"]; text: string; followUp: boolean };

export type StudentInterviewView =
  | { state: "not_found" }
  | (ViewBase & { state: "expired" })
  | (ViewBase & { state: "intro"; voiceEnabled: boolean; expiresAt: string })
  | (ViewBase & {
      state: "chat" | "voice";
      questionCount: number;
      /** 0-based index of the question being answered; equals the count when finished. */
      currentIndex: number;
      transcript: ChatTurnView[];
      voiceEnabled: boolean;
    })
  | (ViewBase & { state: "done" });

function viewOf(
  session: LoadedInterviewSession,
  status: LoadedInterviewSession["status"],
): StudentInterviewView {
  const base: ViewBase = {
    listingTitle: session.application.opportunity.title,
    businessName: session.application.opportunity.organisationProfile.businessName,
  };
  if (status === "expired") return { ...base, state: "expired" };
  if (status === "completed") return { ...base, state: "done" };
  if (status === "invited") {
    return {
      ...base,
      state: "intro",
      voiceEnabled: voiceInterviewEnabled(),
      expiresAt: session.expiresAt.toISOString(),
    };
  }
  const voice = session.mode === "voice" && voiceInterviewEnabled();
  return {
    ...base,
    state: voice ? "voice" : "chat",
    questionCount: readQuestions(session.questions).length,
    currentIndex: session.currentIndex,
    transcript: readTranscript(session.transcript).map((turn) => ({
      role: turn.role,
      text: turn.text,
      followUp: Boolean(turn.followUp),
    })),
    voiceEnabled: voiceInterviewEnabled(),
  };
}

/** The session behind `token` if it belongs to `userId` (the student), else null. */
async function loadOwn(userId: string, token: string) {
  const session = await findSessionByToken(token);
  if (!session || session.application.userProfile.userId !== userId) return null;
  return session;
}

/** What the interview page shows. Never includes the report, scores or questions ahead. */
export async function getInterviewForStudent(
  userId: string,
  token: string,
  now = new Date(),
): Promise<StudentInterviewView> {
  const session = await loadOwn(userId, token);
  if (!session) return { state: "not_found" };
  return viewOf(session, await settleStatus(session, now));
}

const STATUS_FAILURE: Record<string, InterviewFailure> = {
  expired: "expired",
  completed: "already_completed",
};

const aiTurn = (question: InterviewQuestion, at: Date, followUp?: string): TranscriptTurn => ({
  role: "ai",
  text: followUp ?? question.text,
  questionId: question.id,
  ...(followUp ? { followUp: true } : {}),
  at: at.toISOString(),
});

/** Consent + mode: the only way from `invited` to `in_progress` (one attempt). */
export async function startInterview(
  userId: string,
  token: string,
  input: unknown,
  now = new Date(),
): Promise<Result<{ view: StudentInterviewView }, InterviewFailure>> {
  const session = await loadOwn(userId, token);
  if (!session) return { ok: false, reason: "not_found" };
  const status = await settleStatus(session, now);
  if (status !== "invited") {
    return { ok: false, reason: STATUS_FAILURE[status] ?? "already_completed" };
  }
  const parsed = startInputSchema.safeParse(input);
  if (!parsed.success) {
    const consentIssue = parsed.error.issues.some((issue) => issue.path[0] === "consent");
    return consentIssue ? { ok: false, reason: "no_consent" } : { ok: false, reason: "invalid" };
  }
  const mode: InterviewMode = parsed.data.mode;
  if (mode === "voice" && !voiceInterviewEnabled()) return { ok: false, reason: "invalid" };

  const questions = readQuestions(session.questions);
  if (questions.length === 0) return { ok: false, reason: "invalid" };
  const transcript: TranscriptTurn[] = mode === "chat" ? [aiTurn(questions[0], now)] : [];
  const { count } = await getDb().interviewSession.updateMany({
    where: { id: session.id, status: "invited", tokenHash: session.tokenHash },
    data: {
      status: "in_progress",
      mode,
      consentedAt: now,
      startedAt: now,
      currentIndex: 0,
      transcript,
    },
  });
  if (count === 0) return { ok: false, reason: "stale" };
  getLogger().info({ sessionId: session.id, mode }, "AI interview started");
  return { ok: true, view: await getInterviewForStudent(userId, token, now) };
}

/** Voice failed or the student prefers typing: continue from the same question in chat. */
export async function switchToChat(
  userId: string,
  token: string,
  now = new Date(),
): Promise<Result<{ view: StudentInterviewView }, InterviewFailure>> {
  const session = await loadOwn(userId, token);
  if (!session) return { ok: false, reason: "not_found" };
  const status = await settleStatus(session, now);
  if (status !== "in_progress") {
    return { ok: false, reason: STATUS_FAILURE[status] ?? "invalid" };
  }
  if (session.mode !== "chat") {
    const questions = readQuestions(session.questions);
    const question = questions[session.currentIndex];
    if (!question) return { ok: false, reason: "invalid" };
    const transcript = readTranscript(session.transcript);
    const last = transcript.at(-1);
    const needsPrompt = !(last?.role === "ai" && last.questionId === question.id);
    const { count } = await getDb().interviewSession.updateMany({
      where: { id: session.id, status: "in_progress", updatedAt: session.updatedAt },
      data: {
        mode: "chat",
        transcript: needsPrompt ? [...transcript, aiTurn(question, now)] : transcript,
      },
    });
    if (count === 0) return { ok: false, reason: "stale" };
  }
  return { ok: true, view: await getInterviewForStudent(userId, token, now) };
}

/** At most one follow-up for a vague answer (`interview_followup`). Null without an LLM. */
async function decideFollowUp(
  title: string,
  question: InterviewQuestion,
  answers: string[],
): Promise<string | null> {
  const client = createLlmClient();
  if (!client) return null;
  const prompt = buildPrompt(await getPromptContent("interview_followup"), {
    title,
    question: question.text,
    answer: asData("answer", answers.join("\n"), MAX_INTERVIEW_ANSWER_LENGTH * 2),
  });
  const content = await client.chat([
    { role: "system", content: INTERVIEW_DATA_SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ]);
  return content ? parseFollowUp(content) : null;
}

/**
 * Record a chat answer, then ask a follow-up (at most `MAX_FOLLOW_UPS_PER_QUESTION`), the next
 * question, or finish and start the report. Guarded by the question index and transcript length
 * the page showed, and by `updatedAt`, so a double submit fails with `stale` instead of
 * skipping a question.
 */
export async function submitAnswer(
  userId: string,
  token: string,
  input: unknown,
  now = new Date(),
): Promise<Result<{ view: StudentInterviewView }, InterviewFailure>> {
  const session = await loadOwn(userId, token);
  if (!session) return { ok: false, reason: "not_found" };
  const status = await settleStatus(session, now);
  if (status !== "in_progress") {
    return { ok: false, reason: STATUS_FAILURE[status] ?? "invalid" };
  }
  if (session.mode !== "chat") return { ok: false, reason: "invalid" };
  const parsed = answerInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message };
  const answer = parsed.data;

  const questions = readQuestions(session.questions);
  const transcript = readTranscript(session.transcript);
  if (answer.expectedIndex !== session.currentIndex || answer.expectedTurns !== transcript.length) {
    return { ok: false, reason: "stale" };
  }
  const question = questions[session.currentIndex];
  if (!question) return { ok: false, reason: "invalid" };

  const studentTurn: TranscriptTurn = {
    role: "student",
    text: answer.text,
    questionId: question.id,
    ...(answer.pasted ? { pasted: true } : {}),
    at: now.toISOString(),
  };
  const followUpsUsed = transcript.filter(
    (turn) => turn.role === "ai" && turn.followUp && turn.questionId === question.id,
  ).length;
  const followUp =
    followUpsUsed < MAX_FOLLOW_UPS_PER_QUESTION
      ? await decideFollowUp(
          session.application.opportunity.title,
          question,
          [...transcript, studentTurn]
            .filter((turn) => turn.role === "student" && turn.questionId === question.id)
            .map((turn) => turn.text),
        )
      : null;

  const next = questions[session.currentIndex + 1];
  const newTurns: TranscriptTurn[] = [studentTurn];
  let nextIndex = session.currentIndex;
  if (followUp) newTurns.push(aiTurn(question, new Date(), followUp));
  else {
    nextIndex += 1;
    if (next) newTurns.push(aiTurn(next, new Date()));
  }
  const completed = !followUp && !next;

  const { count } = await getDb().interviewSession.updateMany({
    where: {
      id: session.id,
      status: "in_progress",
      mode: "chat",
      currentIndex: session.currentIndex,
      updatedAt: session.updatedAt,
    },
    data: {
      transcript: [...transcript, ...newTurns],
      currentIndex: nextIndex,
      ...(answer.pasted ? { pasteCount: { increment: 1 } } : {}),
      ...(answer.tabLeaves > 0 ? { tabLeaveCount: { increment: answer.tabLeaves } } : {}),
      ...(completed ? { status: "completed" as const, completedAt: new Date() } : {}),
    },
  });
  if (count === 0) return { ok: false, reason: "stale" };

  if (completed) {
    getLogger().info({ sessionId: session.id }, "AI interview completed");
    startInterviewReport(session.id);
  }
  return { ok: true, view: await getInterviewForStudent(userId, token) };
}

// ---------------------------------------------------------------------------------------------
// Organisation side (applicants page; the owner only — never hiring managers or students)
// ---------------------------------------------------------------------------------------------

export type OrgInterviewView = {
  id: string;
  applicationId: string;
  stageId: string;
  stageName: string;
  status: "invited" | "in_progress" | "completed" | "expired";
  mode: InterviewMode | null;
  expiresAt: Date;
  completedAt: Date | null;
  pasteCount: number;
  tabLeaveCount: number;
  questions: InterviewQuestion[];
  transcript: TranscriptTurn[];
  report: InterviewReport | null;
  reportStatus: "pending" | "done" | "failed" | null;
  recommendation: InterviewRecommendation | null;
};

/** Interviews for the organisation's own applications, newest first per application. */
export async function listInterviewsForApplications(
  orgUserId: string,
  applicationIds: string[],
): Promise<Map<string, OrgInterviewView[]>> {
  const map = new Map<string, OrgInterviewView[]>();
  if (applicationIds.length === 0) return map;
  const rows = await getDb().interviewSession.findMany({
    where: {
      applicationId: { in: applicationIds },
      application: { opportunity: { organisationProfile: { userId: orgUserId } } },
    },
    include: {
      stage: { select: { name: true } },
      application: { select: { status: true, currentStageId: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  for (const row of rows) {
    const view: OrgInterviewView = {
      id: row.id,
      applicationId: row.applicationId,
      stageId: row.stageId,
      stageName: row.stage.name,
      // Same lazy expiry as the student page: an unfinished interview whose candidate left the
      // stage (e.g. a direct accept/reject) is shown as expired.
      status:
        (row.status === "invited" || row.status === "in_progress") &&
        (row.application.status !== "submitted" || row.application.currentStageId !== row.stageId)
          ? "expired"
          : row.status,
      mode: row.mode,
      expiresAt: row.expiresAt,
      completedAt: row.completedAt,
      pasteCount: row.pasteCount,
      tabLeaveCount: row.tabLeaveCount,
      questions: readQuestions(row.questions),
      transcript: readTranscript(row.transcript),
      report: row.reportStatus === "done" ? (row.report as InterviewReport | null) : null,
      reportStatus: row.reportStatus,
      recommendation: row.recommendation,
    };
    map.set(row.applicationId, [...(map.get(row.applicationId) ?? []), view]);
  }
  return map;
}

/** "Retry report" for a completed interview whose report failed (owner only). */
export async function retryInterviewReport(
  orgUserId: string,
  sessionId: string,
): Promise<Result<object, InterviewFailure>> {
  const session = await getDb().interviewSession.findFirst({
    where: {
      id: sessionId,
      application: { opportunity: { organisationProfile: { userId: orgUserId } } },
    },
    select: { status: true, reportStatus: true },
  });
  if (!session) return { ok: false, reason: "not_found" };
  if (session.status !== "completed" || session.reportStatus === "done") {
    return { ok: false, reason: "invalid" };
  }
  startInterviewReport(sessionId);
  return { ok: true };
}

/** Most candidates one "Send AI interview" click moves. */
export const MAX_BULK_INTERVIEW_INVITES = 100;

/**
 * "Send AI interview": move each ticked candidate (with the stage the page showed) to the
 * listing's first `ai_interview` stage through the normal progress logic, which opens the
 * interview. Only the organisation's own listing; the AI never picks who is interviewed.
 */
export async function sendAiInterviews(
  orgUserId: string,
  opportunityId: string,
  selections: { applicationId: string; expectedStageId: string | null }[],
): Promise<Result<{ sent: number; skipped: number }, "not_found" | "invalid">> {
  const stage = await getDb().pipelineStage.findFirst({
    where: {
      opportunityId,
      kind: "ai_interview",
      opportunity: { organisationProfile: { userId: orgUserId } },
    },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!stage) return { ok: false, reason: "not_found" };
  if (selections.length === 0 || selections.length > MAX_BULK_INTERVIEW_INVITES) {
    return { ok: false, reason: "invalid" };
  }
  // Imported lazily: pipeline-progress imports this module for its AI interview hook.
  const { moveCandidate } = await import("./pipeline-progress");
  let sent = 0;
  for (const selection of selections) {
    if (selection.expectedStageId === stage.id) continue;
    const result = await moveCandidate(
      orgUserId,
      selection.applicationId,
      selection.expectedStageId,
      stage.id,
    );
    if (result.ok) sent += 1;
  }
  return { ok: true, sent, skipped: selections.length - sent };
}
