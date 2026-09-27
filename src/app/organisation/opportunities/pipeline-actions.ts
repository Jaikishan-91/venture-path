"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import type { PipelineFailure, PipelineStageView, StageInput } from "@/lib/hiring/types";
import { getLogger } from "@/lib/logger";
import { suggestPipeline, type SuggestPipelineFailure } from "@/lib/pipeline-assist";
import { getPipeline, getPipelineTemplate, savePipeline } from "@/lib/pipelines";

const SAVE_FAILURE_MESSAGES: Record<PipelineFailure, string> = {
  not_found: "This listing doesn't exist.",
  not_approved: "Your business must be approved by an admin before you can do this.",
  invalid: "Check the pipeline and try again.",
  locked_stage: "A stage with candidates or history changed. Reload the page and try again.",
  stale: "This pipeline changed since you loaded the page. Reload and try again.",
};

export type SavePipelineResult =
  | { status: "ok"; stages: PipelineStageView[]; version: string }
  | { status: "error"; message: string };

/** "Save pipeline" on the listing edit page. */
export async function savePipelineAction(
  opportunityId: string,
  stages: StageInput[],
  expectedVersion: string,
): Promise<SavePipelineResult> {
  const session = await requireRole("organisation");
  let result;
  try {
    result = await savePipeline(session.user.id, opportunityId, stages, expectedVersion);
  } catch (err) {
    getLogger().error({ userId: session.user.id, opportunityId, err }, "pipeline save failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (!result.ok) {
    return { status: "error", message: result.message ?? SAVE_FAILURE_MESSAGES[result.reason] };
  }
  revalidatePath(`/organisation/opportunities/${opportunityId}/edit`);
  // Return the freshly stored stages (with real ids and updated `reached`/`candidateCount`) so
  // the editor's local state matches what was actually saved.
  const fresh = await getPipeline(session.user.id, opportunityId);
  return { status: "ok", stages: fresh?.stages ?? [], version: fresh?.version ?? result.version };
}

const SUGGEST_FAILURE_MESSAGES: Record<SuggestPipelineFailure, string> = {
  not_found: "This listing doesn't exist.",
  no_llm: "AI suggestions are unavailable right now. Try again later.",
  parse_error: "AI couldn't suggest a pipeline for this listing. Try again later.",
};

export type SuggestPipelineActionResult =
  { status: "ok"; stages: StageInput[] } | { status: "error"; message: string };

/**
 * "Suggest with AI" on the pipeline editor. Returns stages for the editor to apply to its local
 * (unsaved) state; nothing is persisted as stages here.
 */
export async function suggestPipelineAction(
  opportunityId: string,
): Promise<SuggestPipelineActionResult> {
  const session = await requireRole("organisation");
  try {
    const result = await suggestPipeline(session.user.id, opportunityId);
    if (!result.ok) return { status: "error", message: SUGGEST_FAILURE_MESSAGES[result.reason] };
    return { status: "ok", stages: result.stages };
  } catch (err) {
    getLogger().error(
      { userId: session.user.id, opportunityId, err },
      "pipeline suggestion failed",
    );
    return {
      status: "error",
      message: "AI suggestions are unavailable right now. Try again later.",
    };
  }
}

export type CopyPipelineActionResult =
  { status: "ok"; stages: StageInput[] } | { status: "error"; message: string };

/** "Copy from listing" on the pipeline editor. Returns a template for the editor to apply. */
export async function copyPipelineTemplateAction(
  fromOpportunityId: string,
): Promise<CopyPipelineActionResult> {
  const session = await requireRole("organisation");
  const stages = await getPipelineTemplate(session.user.id, fromOpportunityId);
  if (stages.length === 0) {
    return { status: "error", message: "That listing has no pipeline to copy." };
  }
  return { status: "ok", stages };
}
