"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { assistChallenge } from "@/lib/challenge-assist";
import { closeChallenge, markRewardPaid, offerHire, setPlacement } from "@/lib/challenge-reviews";
import { challengeSchema, hireOfferSchema } from "@/lib/challenge-schemas";
import { readFormFile } from "@/lib/challenge-uploads";
import {
  createChallenge,
  deleteDraftChallenge,
  publishChallenge,
  stopSubmissions,
  updateChallenge,
  type ChallengeResult,
} from "@/lib/challenges";
import { flash } from "@/lib/flash";
import { getLogger } from "@/lib/logger";
import type { ChallengeFailure, ChallengePlacement } from "@/lib/v2/types";

const FAILURE_MESSAGES: Record<ChallengeFailure, string> = {
  not_found: "This challenge doesn't exist.",
  not_approved: "Your business must be approved by an admin before you can do this.",
  invalid: "Check the form.",
  no_reward: "Add a reward (money, hiring or both) before publishing.",
  deadline_passed: "The deadline has passed. Set a new deadline first.",
  wrong_status: "This challenge's status changed. Reload the page.",
  reward_unpaid: "Mark the money reward as paid before closing the challenge.",
};

const failureMessage = (result: Extract<ChallengeResult, { ok: false }>) =>
  result.message ?? FAILURE_MESSAGES[result.reason];

export type FormState = { status: "idle" } | { status: "error"; message: string };

const strings = (formData: FormData, name: string) =>
  formData.getAll(name).filter((value): value is string => typeof value === "string");
const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function saveChallengeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("organisation");
  const parsed = challengeSchema().safeParse({
    title: field(formData, "title"),
    problem: field(formData, "problem"),
    goodSolution: field(formData, "goodSolution"),
    criteria: strings(formData, "criteria"),
    rewardMoney: field(formData, "rewardMoney"),
    rewardHire: formData.get("rewardHire") === "on" ? "on" : undefined,
    deadline: field(formData, "deadline"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const file = await readFormFile(formData);
  if (!file.ok) return { status: "error", message: file.message };

  const id = field(formData, "id");
  const publish = formData.get("intent") === "publish";
  const aiAssisted = formData.get("aiAssisted") === "1";
  let result: ChallengeResult;
  try {
    result = id
      ? await updateChallenge(session.user.id, id, parsed.data, {
          publish,
          file: file.file,
          aiAssisted,
        })
      : await createChallenge(session.user.id, parsed.data, {
          publish,
          file: file.file ?? null,
          aiAssisted,
        });
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "challenge save failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (!result.ok) return { status: "error", message: failureMessage(result) };

  await flash(
    "success",
    publish
      ? "Challenge published. Students can now submit."
      : id
        ? "Challenge saved."
        : "Draft saved.",
  );
  revalidatePath("/organisation/challenges");
  redirect("/organisation/challenges");
}

export type AssistState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; problem: string; criteria: string[]; at: number };

/** "Make it clearer with AI": returns suggestions for the form; nothing is saved. */
export async function assistChallengeAction(input: {
  title: string;
  problem: string;
  goodSolution: string;
}): Promise<AssistState> {
  const session = await requireRole("organisation");
  const problem = String(input.problem ?? "").trim();
  if (problem.length < 10) {
    return { status: "error", message: "Describe the problem in a sentence or two first." };
  }
  try {
    const result = await assistChallenge({
      title: String(input.title ?? "").slice(0, 200),
      problem: problem.slice(0, 6000),
      goodSolution: String(input.goodSolution ?? "").slice(0, 3000),
    });
    if (result.ok) {
      return { status: "done", problem: result.problem, criteria: result.criteria, at: Date.now() };
    }
    return {
      status: "error",
      message:
        result.reason === "no_llm"
          ? "AI is unavailable right now. You can still write it yourself."
          : "AI couldn't help with this one. Try again or write it yourself.",
    };
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "challenge assist failed");
    return { status: "error", message: "AI is unavailable right now. Try again later." };
  }
}

const STATUS_MESSAGES = {
  publish: "Challenge published. Students can now submit.",
  stop: "Submissions stopped. Pick a winner from the submissions.",
  close: "Challenge closed. Everyone who took part has been told.",
  delete: "Draft deleted.",
} as const;

export async function challengeStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("organisation");
  const id = field(formData, "id");
  const action = field(formData, "action");
  if (!id) return { status: "error", message: "Missing challenge" };

  let result: ChallengeResult;
  try {
    if (action === "publish") result = await publishChallenge(session.user.id, id);
    else if (action === "stop") result = await stopSubmissions(session.user.id, id);
    else if (action === "close") result = await closeChallenge(session.user.id, id);
    else if (action === "delete") result = await deleteDraftChallenge(session.user.id, id);
    else return { status: "error", message: "Unknown action" };
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "challenge status change failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (!result.ok) return { status: "error", message: failureMessage(result) };

  await flash("success", STATUS_MESSAGES[action as keyof typeof STATUS_MESSAGES]);
  revalidatePath("/organisation/challenges");
  revalidatePath(`/organisation/challenges/${id}/submissions`);
  return { status: "idle" };
}

const PLACEMENTS: readonly ChallengePlacement[] = ["none", "winner", "runner_up"];
const PLACEMENT_MESSAGES: Record<ChallengePlacement, string> = {
  winner: "Picked as winner. We've emailed the student.",
  runner_up: "Picked as runner-up. We've emailed the student.",
  none: "Placement removed.",
};

/** Placement and reward actions on one submission. */
export async function decisionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole("organisation");
  const challengeId = field(formData, "challengeId");
  const submissionId = field(formData, "submissionId");
  const action = field(formData, "action");
  if (!challengeId || !submissionId) return { status: "error", message: "Missing submission" };

  let result: ChallengeResult;
  let message: string;
  try {
    if (action === "placement") {
      const placement = PLACEMENTS.find((value) => value === field(formData, "placement"));
      if (!placement) return { status: "error", message: "Unknown placement" };
      result = await setPlacement(session.user.id, challengeId, submissionId, placement);
      message = PLACEMENT_MESSAGES[placement];
    } else if (action === "paid") {
      result = await markRewardPaid(session.user.id, challengeId, submissionId);
      message = "Marked as paid.";
    } else if (action === "hire") {
      const parsed = hireOfferSchema.safeParse({
        message: field(formData, "message"),
        opportunityId: field(formData, "opportunityId"),
      });
      if (!parsed.success) {
        return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
      }
      result = await offerHire(session.user.id, challengeId, submissionId, parsed.data);
      message = "Hire offer sent by email.";
    } else {
      return { status: "error", message: "Unknown action" };
    }
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "challenge decision failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (!result.ok) return { status: "error", message: failureMessage(result) };

  await flash("success", message);
  revalidatePath(`/organisation/challenges/${challengeId}/submissions`);
  revalidatePath(`/organisation/challenges/${challengeId}/submissions/${submissionId}`);
  return { status: "idle" };
}
