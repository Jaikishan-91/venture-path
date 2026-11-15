import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  type InterviewerOption,
} from "@/lib/hiring/types";
import { scheduleAction } from "./actions";

const selectClass =
  "min-h-24 w-full rounded-lg border border-input bg-white px-2.5 py-1.5 text-base md:text-sm dark:bg-input/30";

/** Schedule form for a candidate's current stage (D7). Server-rendered; posts to `scheduleAction`. */
export function ScheduleForm({
  applicationId,
  stageId,
  defaultDuration,
  interviewerOptions,
}: {
  applicationId: string;
  stageId: string;
  defaultDuration: number;
  interviewerOptions: InterviewerOption[];
}) {
  const startId = `schedule-start-${applicationId}`;
  const durationId = `schedule-duration-${applicationId}`;
  const interviewersId = `schedule-interviewers-${applicationId}`;

  return (
    <form
      action={scheduleAction}
      aria-label="Schedule an interview or test"
      className="flex flex-col gap-3 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-4"
    >
      <p className="text-[13px] font-semibold text-[#121212]">Schedule the next session</p>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="stageId" value={stageId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={startId}>Start</Label>
          <Input id={startId} name="startsAtLocal" type="datetime-local" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={durationId}>Duration (minutes)</Label>
          <Input
            id={durationId}
            name="durationMinutes"
            type="number"
            min={MIN_DURATION_MINUTES}
            max={MAX_DURATION_MINUTES}
            defaultValue={defaultDuration}
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={interviewersId}>Interviewers</Label>
        <select id={interviewersId} name="interviewerUserIds" multiple className={selectClass}>
          {interviewerOptions.map((option) => (
            <option key={option.userId} value={option.userId}>
              {option.name} ({option.kind === "owner" ? "Owner" : "Hiring manager"})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#737373]">
          Times are in India time (IST). Hold Ctrl / ⌘ to pick several interviewers.
        </p>
        <Button type="submit" size="sm">
          Schedule
        </Button>
      </div>
    </form>
  );
}
