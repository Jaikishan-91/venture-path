import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIndiaDateTime, utcToIndiaLocal } from "@/lib/hiring/time";
import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  SCHEDULE_STATUS_LABELS,
  type InterviewerOption,
} from "@/lib/hiring/types";
import type { ScheduledEventView } from "@/lib/scheduling";
import { cancelEventAction, rescheduleAction, retrySyncAction } from "./actions";

const selectClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base md:text-sm dark:bg-input/30";

function calendarStatusLabel(event: ScheduledEventView): string {
  switch (event.calendarSync) {
    case "synced":
      return "Calendar invite sent";
    case "disabled":
      return "Calendar not configured";
    case "failed":
      return "Calendar sync failed";
    default:
      return "Calendar sync pending";
  }
}

/** One application's scheduled events, with reschedule/cancel and a calendar-sync retry (D7). */
export function ScheduledEventsList({
  events,
  interviewerOptions,
}: {
  events: ScheduledEventView[];
  interviewerOptions: InterviewerOption[];
}) {
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex flex-col gap-1 rounded-lg border border-input p-3 text-sm"
        >
          <p className="font-medium">
            {event.stageName} · {formatIndiaDateTime(event.startsAt)} · {event.durationMinutes} min
          </p>
          <p className="text-[#4a4d53]">
            {SCHEDULE_STATUS_LABELS[event.status]} · {calendarStatusLabel(event)}
          </p>
          <p>
            {event.meetUrl ? (
              <a href={event.meetUrl} className="underline">
                Join Google Meet
              </a>
            ) : (
              "-"
            )}
          </p>
          <p>
            Interviewers:{" "}
            {event.interviewers.length === 0
              ? "-"
              : event.interviewers
                  .map((interviewer) =>
                    interviewer.active
                      ? interviewer.name
                      : `${interviewer.name} (no longer active, reschedule)`,
                  )
                  .join(", ")}
          </p>
          {event.status === "scheduled" && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {event.calendarSync === "failed" && (
                <form action={retrySyncAction}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Retry sync
                  </button>
                </form>
              )}
              <details>
                <summary className="cursor-pointer text-xs underline">Reschedule</summary>
                <form
                  action={rescheduleAction}
                  aria-label="Reschedule"
                  className="mt-2 flex flex-col gap-2"
                >
                  <input type="hidden" name="eventId" value={event.id} />
                  <input
                    type="hidden"
                    name="expectedUpdatedAt"
                    value={event.updatedAt.toISOString()}
                  />
                  <Input
                    type="datetime-local"
                    name="startsAtLocal"
                    defaultValue={utcToIndiaLocal(event.startsAt)}
                    required
                  />
                  <Input
                    type="number"
                    name="durationMinutes"
                    defaultValue={event.durationMinutes}
                    min={MIN_DURATION_MINUTES}
                    max={MAX_DURATION_MINUTES}
                    required
                  />
                  <select
                    name="interviewerUserIds"
                    multiple
                    defaultValue={event.interviewers.map((interviewer) => interviewer.userId)}
                    className={selectClass}
                    aria-label="Interviewers"
                  >
                    {interviewerOptions.map((option) => (
                      <option key={option.userId} value={option.userId}>
                        {option.name} ({option.kind === "owner" ? "Owner" : "Hiring manager"})
                      </option>
                    ))}
                    <option value="" disabled>
                      AI Hiring Manager — coming soon
                    </option>
                  </select>
                  <button type="submit" className={buttonVariants({ size: "sm" })}>
                    Save changes
                  </button>
                </form>
              </details>
              <form action={cancelEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Cancel
                </button>
              </form>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
