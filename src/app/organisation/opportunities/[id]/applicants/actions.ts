"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { decideApplication } from "@/lib/applications";
import { getLogger } from "@/lib/logger";
import { reanalyzeForOrganisation } from "@/lib/resume-analysis";
import { flash } from "@/lib/flash";

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
