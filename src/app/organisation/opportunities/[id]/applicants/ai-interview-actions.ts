"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import {
  MAX_BULK_INTERVIEW_INVITES,
  retryInterviewReport,
  sendAiInterviews,
} from "@/lib/ai-interview";
import { flash } from "@/lib/flash";

const revalidateApplicants = () => revalidatePath("/organisation/opportunities", "layout");

/** Ticked candidates arrive as `applicationId|expectedStageId` (empty = Applied). */
function parseSelections(formData: FormData) {
  return formData
    .getAll("selection")
    .filter((value): value is string => typeof value === "string")
    .slice(0, MAX_BULK_INTERVIEW_INVITES + 1)
    .map((value) => {
      const [applicationId, stageId] = value.split("|");
      return { applicationId, expectedStageId: stageId ? stageId : null };
    })
    .filter((selection) => /^[0-9a-f-]{36}$/i.test(selection.applicationId));
}

export async function sendAiInterviewAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const opportunityId = formData.get("opportunityId");
  if (typeof opportunityId !== "string") return;
  const selections = parseSelections(formData);
  if (selections.length === 0) {
    await flash("error", "Tick at least one candidate first.");
    revalidateApplicants();
    return;
  }
  const result = await sendAiInterviews(session.user.id, opportunityId, selections);
  if (!result.ok) {
    await flash(
      "error",
      result.reason === "not_found"
        ? "Add an AI interview step to this listing's pipeline first."
        : `Choose between 1 and ${MAX_BULK_INTERVIEW_INVITES} candidates.`,
    );
  } else {
    await flash(
      result.sent > 0 ? "success" : "error",
      result.sent > 0
        ? `AI interview sent to ${result.sent} candidate${result.sent === 1 ? "" : "s"}.` +
            (result.skipped > 0 ? ` ${result.skipped} skipped (changed meanwhile).` : "")
        : "No interviews sent. These candidates changed meanwhile; reload the page.",
    );
  }
  revalidateApplicants();
}

export async function retryInterviewReportAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const sessionId = formData.get("sessionId");
  if (typeof sessionId !== "string") return;
  const result = await retryInterviewReport(session.user.id, sessionId);
  await flash(
    result.ok ? "success" : "error",
    result.ok
      ? "Writing the report again. Refresh in a minute."
      : "This report can't be retried. Reload the page.",
  );
  revalidateApplicants();
}
