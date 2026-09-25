"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { decideApplication } from "@/lib/applications";
import { getLogger } from "@/lib/logger";
import { analyzeResume } from "@/lib/resume-analysis";

export type ReanalyzeState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; message: string };

const REANALYZE_ERRORS: Record<string, string> = {
  no_llm: "No LLM provider is configured.",
  no_resume: "Could not read the resume file.",
  parse_error: "The LLM returned an unexpected response. Try again.",
};

/** Re-trigger resume analysis for a specific application. MSME-only. */
export async function reanalyzeAction(
  prev: { status: "idle" } | { status: "done" } | { status: "error"; message: string },
  formData: FormData,
): Promise<ReanalyzeState> {
  const session = await requireRole("msme");
  const applicationId = formData.get("applicationId");
  const opportunityId = formData.get("opportunityId");
  if (typeof applicationId !== "string" || !applicationId) {
    return { status: "error", message: "Missing application" };
  }

  try {
    const result = await analyzeResume(applicationId);
    if (!result.ok) {
      return { status: "error", message: REANALYZE_ERRORS[result.reason] ?? "Analysis failed." };
    }
    revalidatePath(
      typeof opportunityId === "string" && opportunityId
        ? `/msme/opportunities/${opportunityId}/applicants`
        : `/msme/opportunities`,
    );
    return { status: "done" };
  } catch (err) {
    getLogger().error({ userId: session.user.id, applicationId, err }, "reanalyze failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}

/** Accept or reject an application. MSME-only. */
export async function decideAction(formData: FormData) {
  const session = await requireRole("msme");
  const applicationId = formData.get("applicationId");
  const decision = formData.get("decision");
  if (typeof applicationId !== "string" || !applicationId) return;
  if (decision !== "accepted" && decision !== "rejected") return;

  const result = await decideApplication(session.user.id, applicationId, decision);
  if (!result.ok) {
    getLogger().warn({ userId: session.user.id, applicationId, reason: result.reason }, "decide failed");
  }
  redirect(`/msme/opportunities`);
}
