import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb } from "./db";
import { getLogger } from "./logger";
import {
  MAX_FOLLOW_UPS_PER_QUESTION,
  type InterviewFailure,
  type InterviewQuestion,
  type Result,
  type TranscriptTurn,
  type VoicePlan,
  type VoiceTranscriptPost,
} from "./v2/types";

/**
 * Voice mode of the AI interview (docs/PRODUCT.md Module 5, WP-D). DB-level only: the Python
 * voice agent reads the plan and writes the transcript through `/api/voice-agent/*`, and the
 * student's browser gets a LiveKit token through `/api/interview/[token]/livekit-token`.
 * No dependency on the chat package's files (src/lib/v2/types.ts "Cross-package functions").
 */

/** Voice is offered only when this is exactly "true" (docs/PRODUCT.md, voice mode rules). */
export function isVoiceInterviewEnabled(): boolean {
  return process.env.VOICE_INTERVIEW_ENABLED === "true";
}

/**
 * Constant-time check of the voice agent's shared secret. False when the server has no secret
 * configured, so a missing variable never opens the endpoints.
 */
export function isValidVoiceAgentSecret(provided: string | null | undefined): boolean {
  const expected = process.env.VOICE_AGENT_SHARED_SECRET ?? "";
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Same hashing as the chat package and team invites: SHA-256 hex of the raw token. */
export const hashInterviewToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

function parseQuestions(value: unknown): InterviewQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (q): q is InterviewQuestion =>
      typeof q === "object" &&
      q !== null &&
      typeof (q as InterviewQuestion).id === "string" &&
      typeof (q as InterviewQuestion).text === "string",
  );
}

function parseTranscript(value: unknown): TranscriptTurn[] {
  return Array.isArray(value) ? (value as TranscriptTurn[]) : [];
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

/** The plan the voice agent speaks. Null unless the session is in progress in voice mode. */
export async function getVoicePlan(sessionId: string): Promise<VoicePlan | null> {
  const session = await getDb().interviewSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      mode: true,
      questions: true,
      currentIndex: true,
      application: {
        select: {
          opportunity: {
            select: { title: true, organisationProfile: { select: { businessName: true } } },
          },
          userProfile: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!session || session.status !== "in_progress" || session.mode !== "voice") return null;

  const questions = parseQuestions(session.questions);
  if (questions.length === 0) return null;
  return {
    sessionId: session.id,
    listingTitle: session.application.opportunity.title,
    businessName: session.application.opportunity.organisationProfile.businessName,
    studentFirstName: firstName(session.application.userProfile.user.name),
    questions: questions.map(({ id, text }) => ({ id, text })),
    currentIndex: Math.min(Math.max(session.currentIndex, 0), questions.length),
    maxFollowUpsPerQuestion: MAX_FOLLOW_UPS_PER_QUESTION,
    language: "en-IN",
  };
}

/** Longest single spoken turn we store; a realtime model can ramble, students rarely do. */
const MAX_VOICE_TURN_LENGTH = 4000;
const MAX_TURNS_PER_POST = 200;

const turnSchema = z.object({
  role: z.enum(["ai", "student"]),
  text: z.string().trim().min(1).max(MAX_VOICE_TURN_LENGTH),
  questionId: z.string().min(1).max(100),
  followUp: z.boolean().optional(),
  at: z.iso.datetime({ offset: true }),
});

export const voiceTranscriptPostSchema = z.object({
  seq: z.number().int().min(0),
  turns: z.array(turnSchema).max(MAX_TURNS_PER_POST),
  currentIndex: z.number().int().min(0),
  completed: z.boolean(),
});

/** Identity of a turn for de-duplication: a resent batch (same seq after a lost reply) adds nothing. */
const turnKey = (t: Pick<TranscriptTurn, "role" | "questionId" | "at" | "text">) =>
  JSON.stringify([t.role, t.questionId, t.at, t.text]);

/**
 * Appends the voice agent's turns. Idempotent: a retried or out-of-order batch only adds turns the
 * session doesn't already have (by role, question, timestamp and text), so no seq needs to be
 * stored and the schema is unchanged. `currentIndex` never moves backwards. `completed: true`
 * finishes the session; repeating it on a completed session is a no-op success.
 */
export async function recordVoiceTranscript(
  sessionId: string,
  post: VoiceTranscriptPost,
): Promise<Result<{ appended: number }, InterviewFailure>> {
  const parsed = voiceTranscriptPostSchema.safeParse(post);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message };
  }
  const input = parsed.data;

  const result = await getDb().$transaction(async (tx) => {
    // Lock the row so a checkpoint and a retried final batch can't interleave their appends.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM interview_session WHERE id = ${sessionId} FOR UPDATE`;
    if (locked.length === 0) return { ok: false, reason: "not_found" } as const;

    const session = await tx.interviewSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { status: true, mode: true, questions: true, transcript: true, currentIndex: true },
    });
    if (session.status === "completed" && session.mode === "voice") {
      return input.completed
        ? ({ ok: true, appended: 0, finished: false } as const)
        : ({ ok: false, reason: "already_completed" } as const);
    }
    if (session.status !== "in_progress" || session.mode !== "voice") {
      return { ok: false, reason: "not_found" } as const;
    }

    const questions = parseQuestions(session.questions);
    const questionIds = new Set(questions.map((q) => q.id));
    if (input.turns.some((t) => !questionIds.has(t.questionId))) {
      return { ok: false, reason: "invalid", message: "Unknown questionId" } as const;
    }

    const transcript = parseTranscript(session.transcript);
    const seen = new Set(transcript.map(turnKey));
    const fresh: TranscriptTurn[] = [];
    for (const t of input.turns) {
      const turn: TranscriptTurn = {
        role: t.role,
        text: t.text,
        questionId: t.questionId,
        ...(t.followUp ? { followUp: true } : {}),
        at: t.at,
      };
      const key = turnKey(turn);
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(turn);
    }

    const currentIndex = input.completed
      ? questions.length
      : Math.min(Math.max(session.currentIndex, input.currentIndex), questions.length);
    const now = new Date();
    await tx.interviewSession.update({
      where: { id: sessionId },
      data: {
        transcript: [...transcript, ...fresh],
        currentIndex,
        ...(input.completed ? { status: "completed", completedAt: now } : {}),
      },
    });
    return { ok: true, appended: fresh.length, finished: input.completed } as const;
  });

  if (!result.ok) return result;
  getLogger().info(
    { sessionId, seq: input.seq, appended: result.appended, completed: input.completed },
    "voice transcript recorded",
  );
  if (result.finished) {
    // MERGE: startInterviewReport(sessionId)
  }
  return { ok: true, appended: result.appended };
}

export type VoiceJoinTarget = { sessionId: string };

export type VoiceJoinFailure = "not_found" | "expired" | "no_consent" | "invalid";

/**
 * The session behind an interview link, if the signed-in student may join its voice room now:
 * their own application, in progress, voice mode, consent given and not expired.
 */
export async function findVoiceSessionForStudent(
  token: string,
  userId: string,
  now: Date = new Date(),
): Promise<Result<VoiceJoinTarget, VoiceJoinFailure>> {
  if (!token || token.length > 200) return { ok: false, reason: "not_found" };
  const session = await getDb().interviewSession.findUnique({
    where: { tokenHash: hashInterviewToken(token) },
    select: {
      id: true,
      status: true,
      mode: true,
      consentedAt: true,
      expiresAt: true,
      application: { select: { userProfile: { select: { userId: true } } } },
    },
  });
  if (!session || session.application.userProfile.userId !== userId) {
    return { ok: false, reason: "not_found" };
  }
  if (session.expiresAt <= now) return { ok: false, reason: "expired" };
  if (!session.consentedAt) return { ok: false, reason: "no_consent" };
  if (session.status !== "in_progress" || session.mode !== "voice") {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, sessionId: session.id };
}
