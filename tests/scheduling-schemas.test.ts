import { describe, expect, it } from "vitest";
import { MAX_SCHEDULE_INTERVIEWERS, parseScheduleInput } from "@/lib/scheduling-schemas";
import { utcToIndiaLocal } from "@/lib/hiring/time";

const now = new Date("2026-10-01T00:00:00Z");
const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const futureLocal = utcToIndiaLocal(future);
const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const pastLocal = utcToIndiaLocal(past);

const base = { startsAtLocal: futureLocal, durationMinutes: 30, interviewerUserIds: ["a"] };

describe("parseScheduleInput", () => {
  it("accepts a valid interview slot with an interviewer", () => {
    const result = parseScheduleInput(base, "interview", now);
    expect(result).toEqual({
      ok: true,
      startsAt: future,
      durationMinutes: 30,
      interviewerUserIds: ["a"],
    });
  });

  it("accepts a test/assignment slot with zero interviewers", () => {
    expect(parseScheduleInput({ ...base, interviewerUserIds: [] }, "test", now)).toMatchObject({
      ok: true,
      interviewerUserIds: [],
    });
    expect(
      parseScheduleInput({ ...base, interviewerUserIds: [] }, "assignment", now),
    ).toMatchObject({ ok: true });
    expect(parseScheduleInput({ ...base, interviewerUserIds: [] }, "other", now)).toMatchObject({
      ok: true,
    });
  });

  it("requires at least one interviewer for an interview stage", () => {
    const result = parseScheduleInput({ ...base, interviewerUserIds: [] }, "interview", now);
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects a malformed startsAtLocal", () => {
    expect(parseScheduleInput({ ...base, startsAtLocal: "not-a-date" }, "interview", now)).toEqual({
      ok: false,
      reason: "invalid",
      message: "Choose a date and time",
    });
    expect(
      parseScheduleInput({ ...base, startsAtLocal: "2026-02-30T10:00" }, "interview", now),
    ).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects a time in the past", () => {
    expect(parseScheduleInput({ ...base, startsAtLocal: pastLocal }, "interview", now)).toEqual({
      ok: false,
      reason: "in_past",
      message: "Choose a time in the future",
    });
  });

  it("rejects a time exactly at now", () => {
    expect(
      parseScheduleInput({ ...base, startsAtLocal: utcToIndiaLocal(now) }, "interview", now),
    ).toMatchObject({ ok: false, reason: "in_past" });
  });

  it("rejects duration outside the allowed range", () => {
    expect(parseScheduleInput({ ...base, durationMinutes: 5 }, "interview", now)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(parseScheduleInput({ ...base, durationMinutes: 1000 }, "interview", now)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects more than the maximum number of interviewers", () => {
    const tooMany = Array.from({ length: MAX_SCHEDULE_INTERVIEWERS + 1 }, (_, i) => `u${i}`);
    expect(
      parseScheduleInput({ ...base, interviewerUserIds: tooMany }, "interview", now),
    ).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects duplicate interviewer ids", () => {
    expect(
      parseScheduleInput({ ...base, interviewerUserIds: ["a", "a"] }, "interview", now),
    ).toMatchObject({ ok: false, reason: "invalid" });
  });
});
