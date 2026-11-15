import { CalendarClock, Users, Video } from "lucide-react";
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
  "min-h-20 w-full rounded-lg border border-input bg-white px-2.5 py-1.5 text-base md:text-sm dark:bg-input/30";

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
          className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] p-4 text-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex items-center gap-2 font-medium text-[#121212]">
              <CalendarClock aria-hidden className="size-4 shrink-0 text-[#737373]" />
              {event.stageName} · {formatIndiaDateTime(event.startsAt)} · {event.durationMinutes}{" "}
              min
            </p>
            <span className="rounded-md border border-[#e5e5e5] bg-[#fafafa] px-1.5 py-0.5 text-[12px] font-medium text-[#525252]">
              {SCHEDULE_STATUS_LABELS[event.status]}
            </span>
          </div>
          <p className="text-[13px] text-[#737373]">{calendarStatusLabel(event)}</p>
          <p className="flex items-center gap-2 text-[13px]">
            <Video aria-hidden className="size-4 shrink-0 text-[#a3a3a3]" />
            {event.meetUrl ? (
              <a
                href={event.meetUrl}
                className="font-medium text-[#15803d] underline-offset-4 hover:underline"
              >
                Join Google Meet
              </a>
            ) : (
              <span className="text-[#a3a3a3]">-</span>
            )}
          </p>
          <p className="flex items-start gap-2 text-[13px] text-[#404040]">
            <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-[#a3a3a3]" />
            <span>
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
            </span>
          </p>
          {event.status === "scheduled" && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#f0f0f0] pt-3">
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
                <summary className="cursor-pointer text-[13px] font-medium text-[#525252] hover:text-[#121212]">
                  Reschedule
                </summary>
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
