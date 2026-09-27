"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { decideApplication } from "@/lib/applications";
import { advanceCandidate, failCandidate, moveCandidate } from "@/lib/pipeline-progress";
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

const PROGRESS_ERRORS: Record<ProgressFailure, string> = {
  not_found: "Application not found.",
  stale: "This candidate's stage changed. Reload the page and try again.",
  invalid: "This listing's pipeline changed. Reload the page and try again.",
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

export async function decideAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const id = formData.get("applicationId");
  const decision = formData.get("decision");
  if (typeof id === "string" && (decision === "accepted" || decision === "rejected")) {
    const result = await decideApplication(session.user.id, id, decision);
    await flash(
      result.ok ? "success" : "error",
      result.ok
        ? decision === "accepted"
          ? "Application accepted. You can now see the applicant's email."
          : "Application rejected."
        : "This application has already been decided or withdrawn.",
    );
  }
  revalidatePath("/organisation/opportunities");
}

function interviewerIdsFrom(formData: FormData): string[] {
  return formData
    .getAll("interviewerUserIds")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function advanceAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string") return;
  const expectedStageId = stringOrNull(formData.get("expectedStageId"));

  const result = await advanceCandidate(session.user.id, applicationId, expectedStageId);
  await flash(
    result.ok ? "success" : "error",
    result.ok
      ? result.accepted
        ? "Candidate passed the final stage and was accepted."
        : "Candidate advanced to the next stage."
      : PROGRESS_ERRORS[result.reason],
  );
  revalidateApplicants();
}

export async function failAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string") return;
  const expectedStageId = stringOrNull(formData.get("expectedStageId"));

  const result = await failCandidate(session.user.id, applicationId, expectedStageId);
  await flash(
    result.ok ? "success" : "error",
    result.ok ? "Candidate rejected." : PROGRESS_ERRORS[result.reason],
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
