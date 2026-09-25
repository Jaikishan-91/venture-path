import { todayInIndia } from "@/lib/opportunity-schemas";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant `days` days before `now`, for "last N days" windows on timestamps. */
export function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Today (India time) through `days` days later, inclusive, as the UTC-midnight `Date`s that
 * `@db.Date` columns such as `Opportunity.deadline` compare against.
 */
export function indiaDateRange(days: number, now = new Date()): { from: Date; to: Date } {
  const from = new Date(`${todayInIndia(now)}T00:00:00Z`);
  return { from, to: new Date(from.getTime() + days * DAY_MS) };
}
