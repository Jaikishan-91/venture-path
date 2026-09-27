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
  "min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base md:text-sm dark:bg-input/30";

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
      className="flex flex-col gap-2 rounded-lg border border-input p-3"
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="stageId" value={stageId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={startId}>Start</Label>
          <Input id={startId} name="startsAtLocal" type="datetime-local" required />
        </div>
        <div className="flex flex-col gap-1">
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
      <div className="flex flex-col gap-1">
        <Label htmlFor={interviewersId}>Interviewers</Label>
        <select id={interviewersId} name="interviewerUserIds" multiple className={selectClass}>
          {interviewerOptions.map((option) => (
            <option key={option.userId} value={option.userId}>
              {option.name} ({option.kind === "owner" ? "Owner" : "Hiring manager"})
            </option>
          ))}
          <option value="" disabled>
            AI Hiring Manager — coming soon
          </option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">Times are in India time (IST).</p>
      <Button type="submit" size="sm" className="self-start">
        Schedule
      </Button>
    </form>
  );
}
