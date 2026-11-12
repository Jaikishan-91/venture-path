"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { submissionSchema } from "@/lib/challenge-schemas";
import { readFormFile } from "@/lib/challenge-uploads";
import { submitSolution } from "@/lib/challenges";
import { flash } from "@/lib/flash";
import { getLogger } from "@/lib/logger";
import type { ChallengeFailure } from "@/lib/v2/types";

const SUBMIT_ERRORS: Record<ChallengeFailure, string> = {
  not_found: "This challenge doesn't exist.",
  not_approved: "This challenge isn't available.",
  invalid: "Check the form.",
  no_reward: "This challenge isn't available.",
  deadline_passed: "The deadline has passed, so solutions can't be sent or edited.",
  wrong_status: "This challenge isn't taking solutions any more.",
  reward_unpaid: "This challenge isn't available.",
};

export type SubmitState = { status: "idle" } | { status: "error"; message: string };

export async function submitSolutionAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const session = await requireRole("user");
  const challengeId = formData.get("challengeId");
  if (typeof challengeId !== "string" || !challengeId) {
    return { status: "error", message: "Missing challenge" };
  }
  const parsed = submissionSchema.safeParse({
    text: formData.get("text") ?? "",
    link: formData.get("link") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const file = await readFormFile(formData);
  if (!file.ok) return { status: "error", message: file.message };

  try {
    const result = await submitSolution(session.user.id, challengeId, parsed.data, file.file);
    if (!result.ok) {
      return { status: "error", message: result.message ?? SUBMIT_ERRORS[result.reason] };
    }
    await flash(
      "success",
      result.created ? "Solution sent. You can edit it until the deadline." : "Solution updated.",
    );
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "challenge submission failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/challenges/${challengeId}`);
  revalidatePath("/challenges");
  return { status: "idle" };
}
