import { buttonVariants } from "@/components/ui/button";
import {
  DEFAULT_DURATION_MINUTES,
  type InterviewerOption,
  type StageKind,
} from "@/lib/hiring/types";
import type { ScheduledEventView } from "@/lib/scheduling";
import { advanceAction, failAction, moveAction } from "./actions";
import { ScheduleForm } from "./schedule-form";
import { FeedbackList } from "@/components/hiring/feedback-list";
import type { FeedbackView } from "@/lib/interview-feedback";
import { ScheduledEventsList } from "./scheduled-events-list";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm dark:bg-input/30";

export type PipelineStageOption = {
  id: string;
  name: string;
  kind: StageKind;
  durationMinutes: number | null;
};

/**
 * A submitted applicant's stage pill plus (collapsed, D5/D7) the pipeline and scheduling
 * controls: Advance / Move / Reject, the schedule form for their current stage, and their
 * scheduled events. Listings without a pipeline never render this (the applicants page keeps its
 * plain Accept/Reject layout).
 */
export function PipelinePanel({
  applicationId,
  status,
  currentStageId,
  stages,
  events,
  feedback,
  interviewerOptions,
}: {
  applicationId: string;
  status: "submitted" | "accepted" | "rejected" | "withdrawn";
  currentStageId: string | null;
  stages: PipelineStageOption[];
  events: ScheduledEventView[];
  /** Interviewers' feedback on this application (never shown to the candidate). */
  feedback: FeedbackView[];
  interviewerOptions: InterviewerOption[];
}) {
  const currentIndex = currentStageId
    ? stages.findIndex((stage) => stage.id === currentStageId)
    : -1;
  const currentStage = currentIndex >= 0 ? stages[currentIndex] : null;
  const nextStage = stages[currentIndex + 1];
  const isLastStage = currentIndex === stages.length - 1;
  const expectedStageValue = currentStageId ?? "";

  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex w-fit items-center rounded-full bg-[#eef0f4] px-2.5 py-0.5 text-xs font-medium">
        {currentStage ? currentStage.name : "Applied"}
      </span>

      {status === "submitted" && (
        <details className="rounded-lg bg-[#f7f7f9] p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Pipeline &amp; scheduling
          </summary>
          <div className="mt-3 flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <form action={advanceAction}>
                <input type="hidden" name="applicationId" value={applicationId} />
                <input type="hidden" name="expectedStageId" value={expectedStageValue} />
                <button type="submit" className={buttonVariants({ size: "sm" })}>
                  {isLastStage
                    ? "Pass final stage & accept"
                    : `Advance to ${nextStage?.name ?? "next stage"}`}
                </button>
              </form>
              <form action={failAction}>
                <input type="hidden" name="applicationId" value={applicationId} />
                <input type="hidden" name="expectedStageId" value={expectedStageValue} />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Reject
                </button>
              </form>
              <form action={moveAction} className="flex items-center gap-2">
                <input type="hidden" name="applicationId" value={applicationId} />
                <input type="hidden" name="expectedStageId" value={expectedStageValue} />
                <select
                  name="targetStageId"
                  defaultValue=""
                  className={selectClass}
                  aria-label="Move to stage"
                >
                  <option value="" disabled>
                    Move to…
                  </option>
                  <option value="applied">Applied</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Move
                </button>
              </form>
            </div>

            {currentStage && (
              <ScheduleForm
                applicationId={applicationId}
                stageId={currentStage.id}
                defaultDuration={currentStage.durationMinutes ?? DEFAULT_DURATION_MINUTES}
                interviewerOptions={interviewerOptions}
              />
            )}

            {events.length > 0 && (
              <ScheduledEventsList events={events} interviewerOptions={interviewerOptions} />
            )}
          </div>
        </details>
      )}

      {events.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Interview feedback</p>
          <FeedbackList items={feedback} />
        </div>
      )}
    </div>
  );
}
