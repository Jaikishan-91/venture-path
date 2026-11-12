"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { advanceCandidate, moveCandidate } from "@/lib/pipeline-progress";
import {
  cancelScheduledEvent,
  rescheduleEvent,
  retryCalendarSync,
  scheduleEvent,
} from "@/lib/scheduling";
import type { ProgressFailure, ScheduleFailure } from "@/lib/hiring/types";
import { getLogger } from "@/lib/logger";
import { reanalyzeForOrganisation } from "@/lib/resume-analysis";
import { flash } from "@/lib/flash";
import { makeOffer, markNotSelected, withdrawOffer, type NotSelectedFailure } from "@/lib/offers";
import { applyRecommendedStages } from "@/lib/pipelines";
import type { OfferFailure } from "@/lib/v2/types";

const PROGRESS_ERRORS: Record<ProgressFailure, string> = {
  not_found: "Application not found.",
  stale: "This candidate's stage changed. Reload the page and try again.",
  invalid: "This listing's hiring steps changed. Reload the page and try again.",
  last_stage: "This is the last step. Make an offer instead.",
};

const NOT_SELECTED_ERRORS: Record<NotSelectedFailure, string> = {
  ...PROGRESS_ERRORS,
  wrong_state: "An offer is waiting for the student. Withdraw it first.",
};

const OFFER_ERRORS: Record<OfferFailure, string> = {
  not_found: "Application not found.",
  invalid: "Check the offer details.",
  not_ready: "Move the candidate through every hiring step before making an offer.",
  wrong_state: "An offer is already waiting, or this candidate is already decided.",
  stale: "This candidate changed meanwhile. Reload the page and try again.",
};

const SCHEDULE_ERRORS: Record<ScheduleFailure, string> = {
  not_found: "Application or event not found.",
  invalid: "Check the schedule details.",
  in_past: "Choose a time in the future.",
  wrong_stage: "The candidate is no longer at that stage. Reload the page.",
  bad_interviewer: "One of the chosen interviewers is no longer available. Reload the page.",
  stale: "This event changed. Reload the page and try again.",
};

const revalidateApplicants = () => revalidatePath("/organisation/opportunities", "layout");

const stringOrNull = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export type ReanalyzeState =
  { status: "idle" } | { status: "done" } | { status: "error"; message: string };

const REANALYZE_ERRORS: Record<string, string> = {
  not_found: "Application not found.",
  no_llm: "The analysis service is unavailable. Try again later.",
  no_resume: "Could not read text from the resume file.",
  parse_error: "The analysis service returned an unexpected response. Try again.",
};

/** Re-run resume analysis for one of the organisation's own applications. */
export async function reanalyzeAction(
  _prev: ReanalyzeState,
  formData: FormData,
): Promise<ReanalyzeState> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string" || !applicationId) {
    return { status: "error", message: "Missing application" };
  }

  try {
    const result = await reanalyzeForOrganisation(session.user.id, applicationId);
    if (!result.ok) {
      return { status: "error", message: REANALYZE_ERRORS[result.reason] ?? "Analysis failed." };
    }
  } catch (err) {
    getLogger().error({ userId: session.user.id, applicationId, err }, "reanalyze failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  await flash("success", "Resume analysis updated.");
  revalidatePath("/organisation/opportunities", "layout");
  return { status: "done" };
}

function interviewerIdsFrom(formData: FormData): string[] {
  return formData
    .getAll("interviewerUserIds")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

/** "Move to <next step>" / "Send AI interview" (one candidate). Never hires: see `makeOfferAction`. */
export async function advanceAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string") return;
  const expectedStageId = stringOrNull(formData.get("expectedStageId"));
  // Only picks the toast text; the server decides what the next stage is.
  const aiInterview = formData.get("nextKind") === "ai_interview";

  const result = await advanceCandidate(session.user.id, applicationId, expectedStageId);
  await flash(
    result.ok ? "success" : "error",
    result.ok
      ? aiInterview
        ? "AI interview sent. The candidate gets a private link by email."
        : "Candidate moved to the next step."
      : PROGRESS_ERRORS[result.reason],
  );
  revalidateApplicants();
}

export type FormActionState =
  { status: "idle" } | { status: "done" } | { status: "error"; message: string };

/** "Not selected" with an optional kind reason (sent in the email). */
export async function notSelectedAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string") return { status: "error", message: "Missing application" };
  const expectedStageId = stringOrNull(formData.get("expectedStageId"));
  const reason = formData.get("reason");

  const result = await markNotSelected(
    session.user.id,
    applicationId,
    expectedStageId,
    typeof reason === "string" ? reason : undefined,
  );
  if (!result.ok) {
    return { status: "error", message: result.message ?? NOT_SELECTED_ERRORS[result.reason] };
  }
  await flash("success", "Marked not selected. The candidate was told by email.");
  revalidateApplicants();
  return { status: "done" };
}

/** Bulk "Not selected" from the board (no reason). Selections are `applicationId|expectedStageId`. */
export async function bulkNotSelectedAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const selections = formData
    .getAll("selection")
    .filter((value): value is string => typeof value === "string")
    .slice(0, 100)
    .map((value) => {
      const [applicationId, stageId] = value.split("|");
      return { applicationId, expectedStageId: stageId ? stageId : null };
    })
    .filter((selection) => /^[0-9a-f-]{36}$/i.test(selection.applicationId));
  if (selections.length === 0) {
    await flash("error", "Select at least one candidate first.");
    revalidateApplicants();
    return;
  }
  let done = 0;
  for (const selection of selections) {
    const result = await markNotSelected(
      session.user.id,
      selection.applicationId,
      selection.expectedStageId,
      undefined,
    );
    if (result.ok) done += 1;
  }
  const skipped = selections.length - done;
  await flash(
    done > 0 ? "success" : "error",
    done > 0
      ? `${done} marked not selected.` +
          (skipped > 0 ? ` ${skipped} skipped (changed meanwhile).` : "")
      : "Nobody was changed. These candidates changed meanwhile; reload the page.",
  );
  revalidateApplicants();
}

/** "Make offer": message, optional stipend and start date. */
export async function makeOfferAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string") return { status: "error", message: "Missing application" };
  const result = await makeOffer(session.user.id, applicationId, {
    message: formData.get("message") ?? "",
    stipendInr: formData.get("stipendInr") ?? "",
    startDate: formData.get("startDate") ?? "",
  });
  if (!result.ok) {
    return { status: "error", message: result.message ?? OFFER_ERRORS[result.reason] };
  }
  await flash("success", "Offer sent. The student can accept or decline it in the app.");
  revalidateApplicants();
  return { status: "done" };
}

export async function withdrawOfferAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string") return;
  const result = await withdrawOffer(session.user.id, applicationId);
  await flash(
    result.ok ? "success" : "error",
    result.ok ? "Offer withdrawn." : OFFER_ERRORS[result.reason],
  );
  revalidateApplicants();
}

/** "Use recommended steps" (D3): only when the listing has no steps yet. */
export async function recommendedStepsAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const opportunityId = formData.get("opportunityId");
  if (typeof opportunityId !== "string") return;
  const result = await applyRecommendedStages(session.user.id, opportunityId);
  await flash(
    result.ok ? "success" : "error",
    result.ok
      ? "Hiring steps added: AI interview, then Live interview."
      : result.reason === "not_approved"
        ? "Your business must be approved by an admin before you can do this."
        : result.reason === "stale"
          ? "This listing already has hiring steps."
          : "Listing not found.",
  );
  revalidateApplicants();
}

export async function moveAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string") return;
  const expectedStageId = stringOrNull(formData.get("expectedStageId"));
  const targetRaw = stringOrNull(formData.get("targetStageId"));
  const targetStageId = targetRaw === "applied" ? null : targetRaw;

  const result = await moveCandidate(
    session.user.id,
    applicationId,
    expectedStageId,
    targetStageId,
  );
  await flash(
    result.ok ? "success" : "error",
    result.ok ? "Candidate moved." : PROGRESS_ERRORS[result.reason],
  );
  revalidateApplicants();
}

export async function scheduleAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  const stageId = formData.get("stageId");
  const startsAtLocal = formData.get("startsAtLocal");
  const durationMinutes = Number(formData.get("durationMinutes"));
  if (
    typeof applicationId !== "string" ||
    typeof stageId !== "string" ||
    typeof startsAtLocal !== "string"
  ) {
    await flash("error", "Check the schedule form.");
    revalidateApplicants();
    return;
  }

  const result = await scheduleEvent(session.user.id, {
    applicationId,
    stageId,
    startsAtLocal,
    durationMinutes,
    interviewerUserIds: interviewerIdsFrom(formData),
  });
  await flash(
    result.ok ? "success" : "error",
    result.ok ? "Interview scheduled." : (result.message ?? SCHEDULE_ERRORS[result.reason]),
  );
  revalidateApplicants();
}

export async function rescheduleAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const eventId = formData.get("eventId");
  const startsAtLocal = formData.get("startsAtLocal");
  const durationMinutes = Number(formData.get("durationMinutes"));
  const expectedUpdatedAtRaw = formData.get("expectedUpdatedAt");
  if (
    typeof eventId !== "string" ||
    typeof startsAtLocal !== "string" ||
    typeof expectedUpdatedAtRaw !== "string"
  ) {
    await flash("error", "Check the reschedule form.");
    revalidateApplicants();
    return;
  }

  const result = await rescheduleEvent(session.user.id, eventId, {
    startsAtLocal,
    durationMinutes,
    interviewerUserIds: interviewerIdsFrom(formData),
    expectedUpdatedAt: new Date(expectedUpdatedAtRaw),
  });
  await flash(
    result.ok ? "success" : "error",
    result.ok ? "Interview rescheduled." : (result.message ?? SCHEDULE_ERRORS[result.reason]),
  );
  revalidateApplicants();
}

export async function cancelEventAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string") return;

  const result = await cancelScheduledEvent(session.user.id, eventId);
  await flash(
    result.ok ? "success" : "error",
    result.ok ? "Interview cancelled." : (result.message ?? SCHEDULE_ERRORS[result.reason]),
  );
  revalidateApplicants();
}

export async function retrySyncAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string") return;

  const result = await retryCalendarSync(session.user.id, eventId);
  await flash(
    result.ok ? "success" : "error",
    result.ok ? "Calendar sync retried." : (result.message ?? SCHEDULE_ERRORS[result.reason]),
  );
  revalidateApplicants();
}
