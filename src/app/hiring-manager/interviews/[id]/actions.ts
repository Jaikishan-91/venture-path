"use server";

import { revalidatePath } from "next/cache";
import { requireActiveHiringManager } from "@/lib/authz";
import { feedbackSchema } from "@/lib/feedback-schemas";
import { flash } from "@/lib/flash";
import type { FeedbackFailure } from "@/lib/hiring/types";
import { submitFeedback } from "@/lib/interview-feedback";
import { getLogger } from "@/lib/logger";

export type FeedbackFormState = { status: "idle" } | { status: "error"; message: string };

const FAILURE_MESSAGES: Record<FeedbackFailure, string> = {
  not_found: "This interview is no longer available to you.",
  cancelled: "This interview was cancelled.",
  not_yet: "You can submit feedback once the interview has started.",
  invalid: "Check the form and try again.",
};

export async function submitFeedbackAction(
  eventId: string,
  _prev: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  const { session, membership } = await requireActiveHiringManager();
  const values = Object.fromEntries(formData);
  const parsed = feedbackSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  try {
    const result = await submitFeedback(
      session.user.id,
      membership.organisationProfileId,
      eventId,
      parsed.data,
    );
    if (!result.ok) {
      return { status: "error", message: FAILURE_MESSAGES[result.reason] };
    }
  } catch (err) {
    getLogger().error({ userId: session.user.id, eventId, err }, "interview feedback failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  await flash("success", "Feedback saved.");
  revalidatePath(`/hiring-manager/interviews/${eventId}`);
  revalidatePath("/hiring-manager");
  return { status: "idle" };
}
