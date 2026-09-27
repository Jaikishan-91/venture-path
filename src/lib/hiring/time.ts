/** India has one fixed offset (+05:30) and no daylight saving time. */
const INDIA_OFFSET_MINUTES = 330;
const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `YYYY-MM-DDTHH:mm` in India time → UTC `Date`. Null for anything malformed or impossible. */
export function indiaLocalToUtc(local: string): Date | null {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - INDIA_OFFSET_MINUTES * 60_000;
  const date = new Date(utcMs);
  // Reject dates that rolled over (e.g. 2026-02-30).
  if (utcToIndiaLocal(date) !== local) return null;
  return date;
}

/** UTC `Date` → `YYYY-MM-DDTHH:mm` in India time, the value a `datetime-local` input expects. */
export function utcToIndiaLocal(date: Date): string {
  return new Date(date.getTime() + INDIA_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

const displayFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** e.g. "Mon, 5 Oct 2026, 3:30 pm IST". */
export function formatIndiaDateTime(date: Date): string {
  return `${displayFormat.format(date)} IST`;
}
