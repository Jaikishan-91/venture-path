"use server";

import {
  getInterviewForStudent,
  startInterview,
  submitAnswer,
  switchToChat,
  type StudentInterviewView,
} from "@/lib/ai-interview";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import type { AnswerInput } from "@/lib/ai-interview-schemas";
import type { InterviewFailure } from "@/lib/v2/types";

export type InterviewActionState = { view: StudentInterviewView; error?: string };

const ERRORS: Record<InterviewFailure, string> = {
  not_found: "This interview link isn't valid.",
  expired: "This interview is no longer open.",
  already_completed: "This interview is already submitted.",
  no_consent: "Tick the box to agree before you start.",
  invalid: "Check your answer and try again.",
  stale: "This interview moved on in another tab. Here is where you are now.",
};

async function run(
  token: string,
  work: (
    userId: string,
  ) => Promise<
    | { ok: true; view: StudentInterviewView }
    | { ok: false; reason: InterviewFailure; message?: string }
  >,
): Promise<InterviewActionState> {
  const session = await requireRole("user");
  try {
    const result = await work(session.user.id);
    if (result.ok) return { view: result.view };
    return {
      view: await getInterviewForStudent(session.user.id, token),
      error: result.message ?? ERRORS[result.reason],
    };
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "interview action failed");
    return {
      view: await getInterviewForStudent(session.user.id, token),
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function startInterviewAction(
  token: string,
  input: { mode: "chat" | "voice"; consent: boolean },
): Promise<InterviewActionState> {
  return run(token, (userId) => startInterview(userId, token, input));
}

export async function submitAnswerAction(
  token: string,
  input: AnswerInput,
): Promise<InterviewActionState> {
  return run(token, (userId) => submitAnswer(userId, token, input));
}

export async function switchToChatAction(token: string): Promise<InterviewActionState> {
  return run(token, (userId) => switchToChat(userId, token));
}
