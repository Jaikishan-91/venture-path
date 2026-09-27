import { z } from "zod";
import { indiaLocalToUtc } from "./hiring/time";
import {
  MAX_DURATION_MINUTES,
  MEET_STAGE_KINDS,
  MIN_DURATION_MINUTES,
  type StageKind,
} from "./hiring/types";

/**
 * Pure validation for scheduling an interview/test slot (WP4, D7). No server imports, so this is
 * safe to import from client components too.
 */

export const MAX_SCHEDULE_INTERVIEWERS = 5;

const LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const scheduleFormSchema = z.object({
  startsAtLocal: z.string().regex(LOCAL_PATTERN, "Choose a date and time"),
  durationMinutes: z
    .number()
    .int()
    .min(MIN_DURATION_MINUTES, `Duration must be at least ${MIN_DURATION_MINUTES} minutes`)
    .max(MAX_DURATION_MINUTES, `Duration can't exceed ${MAX_DURATION_MINUTES} minutes`),
  interviewerUserIds: z
    .array(z.string().trim().min(1))
    .max(MAX_SCHEDULE_INTERVIEWERS, `Choose at most ${MAX_SCHEDULE_INTERVIEWERS} interviewers`)
    .refine((ids) => new Set(ids).size === ids.length, "Choose each interviewer only once"),
});

export type ScheduleFormInput = z.input<typeof scheduleFormSchema>;

export type ScheduleParseFailure = { ok: false; reason: "invalid" | "in_past"; message: string };
export type ScheduleParseResult =
  | { ok: true; startsAt: Date; durationMinutes: number; interviewerUserIds: string[] }
  | ScheduleParseFailure;

/**
 * Validate a schedule/reschedule form: shape via `scheduleFormSchema`, `startsAtLocal` via
 * `indiaLocalToUtc` (all slots are in India time, D7), the time must be in the future, and —
 * because a Meet link needs someone to invite — a stage in `MEET_STAGE_KINDS` needs at least one
 * interviewer (a test/assignment slot may have zero).
 */
export function parseScheduleInput(
  input: unknown,
  stageKind: StageKind,
  now: Date = new Date(),
): ScheduleParseResult {
  const parsed = scheduleFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message ?? "Check the schedule details",
    };
  }

  const startsAt = indiaLocalToUtc(parsed.data.startsAtLocal);
  if (!startsAt) {
    return { ok: false, reason: "invalid", message: "Enter a valid date and time" };
  }
  if (startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "in_past", message: "Choose a time in the future" };
  }
  if (MEET_STAGE_KINDS.includes(stageKind) && parsed.data.interviewerUserIds.length === 0) {
    return { ok: false, reason: "invalid", message: "Choose at least one interviewer" };
  }

  return {
    ok: true,
    startsAt,
    durationMinutes: parsed.data.durationMinutes,
    interviewerUserIds: parsed.data.interviewerUserIds,
  };
}
