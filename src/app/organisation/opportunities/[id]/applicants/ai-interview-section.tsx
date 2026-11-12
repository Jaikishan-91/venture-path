import { AiInterviewReport } from "@/components/hiring/ai-interview-report";
import { buttonVariants } from "@/components/ui/button";
import type { OrgInterviewView } from "@/lib/ai-interview";
import { getLlmConfig } from "@/lib/llm/config";
import { advanceAction, failAction } from "./actions";
import { retryInterviewReportAction, sendAiInterviewAction } from "./ai-interview-actions";
import type { PipelineStageOption } from "./pipeline-panel";

/** Form id the per-applicant "Select" checkboxes attach to (HTML `form` attribute). */
export const SEND_AI_INTERVIEW_FORM_ID = "send-ai-interview";

/** "Send AI interview" for the ticked candidates (only rendered when the listing has the stage). */
export function SendAiInterviewForm({
  opportunityId,
  stageName,
}: {
  opportunityId: string;
  stageName: string;
}) {
  return (
    <form
      id={SEND_AI_INTERVIEW_FORM_ID}
      action={sendAiInterviewAction}
      className="flex flex-wrap items-center gap-3 rounded-lg bg-[#f7f7f9] p-3 text-sm"
    >
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <button type="submit" className={buttonVariants({ size: "sm" })}>
        Send AI interview
      </button>
      <span className="text-muted-foreground">
        Tick candidates below. They move to “{stageName}” and get a private link by email.
      </span>
    </form>
  );
}

/** Per-applicant tick box for "Send AI interview". */
export function SendAiInterviewCheckbox({
  applicationId,
  currentStageId,
}: {
  applicationId: string;
  currentStageId: string | null;
}) {
  return (
    <label className="flex w-fit items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="selection"
        value={`${applicationId}|${currentStageId ?? ""}`}
        form={SEND_AI_INTERVIEW_FORM_ID}
      />
      Select for AI interview
    </label>
  );
}

/** The latest AI interview of an applicant, with the existing Advance / Reject actions. */
export function AiInterviewSection({
  interview,
  applicationStatus,
  currentStageId,
  stages,
}: {
  interview: OrgInterviewView;
  applicationStatus: "submitted" | "accepted" | "rejected" | "withdrawn";
  currentStageId: string | null;
  stages: PipelineStageOption[];
}) {
  const atInterviewStage =
    applicationStatus === "submitted" && currentStageId === interview.stageId;
  const index = stages.findIndex((stage) => stage.id === currentStageId);
  const nextStage = index >= 0 ? stages[index + 1] : undefined;
  const expectedStageValue = currentStageId ?? "";

  const actions = atInterviewStage && interview.status === "completed" && (
    <>
      <form action={advanceAction}>
        <input type="hidden" name="applicationId" value={interview.applicationId} />
        <input type="hidden" name="expectedStageId" value={expectedStageValue} />
        <button type="submit" className={buttonVariants({ size: "sm" })}>
          {nextStage ? `Move to ${nextStage.name}` : "Accept"}
        </button>
      </form>
      <form action={failAction}>
        <input type="hidden" name="applicationId" value={interview.applicationId} />
        <input type="hidden" name="expectedStageId" value={expectedStageValue} />
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Reject
        </button>
      </form>
    </>
  );
  const retry = (
    <form action={retryInterviewReportAction}>
      <input type="hidden" name="sessionId" value={interview.id} />
      <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Retry report
      </button>
    </form>
  );

  // With AI switched off a retry can't work; the panel says "AI unavailable" instead (PRODUCT.md §3 rule 7).
  const aiAvailable = getLlmConfig().kind !== "disabled";
  return (
    <AiInterviewReport
      interview={interview}
      actions={actions || undefined}
      retry={aiAvailable ? retry : undefined}
      aiAvailable={aiAvailable}
    />
  );
}
