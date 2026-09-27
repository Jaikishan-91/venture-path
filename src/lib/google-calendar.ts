import "server-only";
import { isReservedAddress } from "./email";
import { getEnv, type Env } from "./env";
import type {
  CalendarAttendee,
  CalendarEventInput,
  CalendarEventResult,
  CalendarFailure,
  Result,
} from "./hiring/types";
import { getLogger } from "./logger";

/**
 * Google Calendar + Meet integration (WP3, ADR-035): plain `fetch`, no Google SDK. One platform
 * Google account (refresh token in `.env`) creates every event and invites attendees. Never
 * throws to callers — every exported function returns a typed result so a Calendar outage or a
 * missing/expired refresh token degrades scheduling instead of breaking it (see plan
 * `plan/2026-09-26-hiring-pipelines-and-interviews.md`, "Google Calendar not configured" default).
 */

const logger = getLogger();

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars";
const REQUEST_TIMEOUT_MS = 15_000;
/** All interview/test slots are scheduled in India time (plan D7). */
const TIME_ZONE = "Asia/Kolkata";
/** Meet creation is asynchronous; re-fetch the event this many times while it's "pending". */
const MEET_POLL_ATTEMPTS = 3;

let pollDelayMs = 300;

/** Test hook: make the pending-Meet re-fetch delay zero (or otherwise controllable) in tests. */
export function setCalendarPollDelayForTests(ms: number): void {
  pollDelayMs = ms;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// -------------------------------------------------------------------------------------------
// Enabled check + attendee filtering
// -------------------------------------------------------------------------------------------

/** True only when the platform account is fully configured (ADR-035). */
export function isCalendarEnabled(): boolean {
  const env = getEnv();
  return Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALENDAR_REFRESH_TOKEN,
  );
}

/**
 * Drop attendees who would bounce and dedupe by lowercased email. Pure, for tests. Outside
 * production, reserved-domain addresses (RFC 2606/6761, `isReservedAddress`) are never sent to
 * Google; they still receive the VenturePath email via the local mail catcher (ADR-018 pattern).
 */
export function calendarAttendees(attendees: CalendarAttendee[], env: Env): CalendarAttendee[] {
  const seen = new Set<string>();
  const result: CalendarAttendee[] = [];
  for (const attendee of attendees) {
    const email = attendee.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    if (env.NODE_ENV !== "production" && isReservedAddress(email)) continue;
    seen.add(email);
    result.push({ email, name: attendee.name });
  }
  return result;
}

// -------------------------------------------------------------------------------------------
// Access token: fetch + in-memory cache
// -------------------------------------------------------------------------------------------

type TokenCache = { accessToken: string; expiresAt: number };
const globalForCalendarToken = globalThis as unknown as { calendarToken?: TokenCache };

/** Clear the cached access token, so the next request fetches a fresh one. Also used by tests. */
export function clearCalendarTokenCache(): void {
  globalForCalendarToken.calendarToken = undefined;
}

type TokenFailure = Extract<CalendarFailure, "auth" | "http" | "timeout" | "network">;
type TokenResult = Result<{ accessToken: string }, TokenFailure>;

/** Callers must have checked `isCalendarEnabled()`. */
function calendarCredentials(env: Env): {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
} {
  return {
    clientId: env.GOOGLE_CLIENT_ID as string,
    clientSecret: env.GOOGLE_CLIENT_SECRET as string,
    refreshToken: env.GOOGLE_CALENDAR_REFRESH_TOKEN as string,
  };
}

async function fetchAccessToken(): Promise<TokenResult> {
  const { clientId, clientSecret, refreshToken } = calendarCredentials(getEnv());
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      logger.warn({ event: "calendar.token.timeout" }, "Google token request timed out");
      return { ok: false, reason: "timeout" };
    }
    logger.warn({ event: "calendar.token.network_error" }, "Google token request failed");
    return { ok: false, reason: "network" };
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}) as { error?: string })) as { error?: string };
    if (res.status === 400 || res.status === 401) {
      logger.warn(
        { event: "calendar.token.auth_failed", status: res.status, error: data.error },
        "Google Calendar refresh token was rejected. Re-run `npm run google:calendar-token` to " +
          "obtain a new one. Note: a refresh token from a 'Testing' status OAuth app expires " +
          "after 7 days; use 'In production' (unverified is fine for a single platform account).",
      );
      return { ok: false, reason: "auth" };
    }
    logger.warn(
      { event: "calendar.token.http_error", status: res.status },
      "Google token request failed",
    );
    return { ok: false, reason: "http", message: data.error ?? `HTTP ${res.status}` };
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  globalForCalendarToken.calendarToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
  };
  logger.info({ event: "calendar.token.refreshed" }, "Google Calendar access token refreshed");
  return { ok: true, accessToken: data.access_token };
}

async function getAccessToken(): Promise<TokenResult> {
  const cached = globalForCalendarToken.calendarToken;
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, accessToken: cached.accessToken };
  }
  return fetchAccessToken();
}

// -------------------------------------------------------------------------------------------
// Calendar API request helper (token attach, timeout/network mapping, one 401 retry)
// -------------------------------------------------------------------------------------------

type CalendarErrorBody = { error?: { message?: string } };

type RequestOutcome =
  | { ok: true; status: number; json: unknown }
  | {
      ok: false;
      status?: number;
      failure: { ok: false; reason: CalendarFailure; message?: string };
    };

function calendarUrl(env: Env, eventId: string | null, query: string): string {
  const base = `${CALENDAR_API_BASE}/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}${query}` : `${base}${query}`;
}

async function requestCalendar(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
  attempt = 0,
): Promise<RequestOutcome> {
  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) {
    return { ok: false, failure: { ok: false, reason: tokenResult.reason } };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      logger.warn(
        { event: "calendar.request.timeout", method },
        "Google Calendar request timed out",
      );
      return { ok: false, failure: { ok: false, reason: "timeout" } };
    }
    logger.warn(
      { event: "calendar.request.network_error", method },
      "Google Calendar request failed",
    );
    return { ok: false, failure: { ok: false, reason: "network" } };
  }

  if (res.status === 401) {
    if (attempt === 0) {
      logger.warn(
        { event: "calendar.request.unauthorized", method },
        "Google Calendar returned 401; clearing cached token and retrying once",
      );
      clearCalendarTokenCache();
      return requestCalendar(method, url, body, attempt + 1);
    }
    logger.warn(
      { event: "calendar.request.unauthorized_retry_failed", method },
      "Google Calendar still returned 401 after refreshing the token",
    );
    return { ok: false, status: res.status, failure: { ok: false, reason: "auth" } };
  }

  if (res.ok) {
    const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
    return { ok: true, status: res.status, json };
  }

  const errBody = (await res.json().catch(() => ({}))) as CalendarErrorBody;
  logger.warn(
    { event: "calendar.request.http_error", method, status: res.status },
    "Google Calendar request failed",
  );
  return {
    ok: false,
    status: res.status,
    failure: { ok: false, reason: "http", message: errBody.error?.message ?? `HTTP ${res.status}` },
  };
}

// -------------------------------------------------------------------------------------------
// Event shape helpers
// -------------------------------------------------------------------------------------------

type GoogleEvent = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
};

function extractMeetUrl(event: GoogleEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video",
  );
  return video?.uri ?? null;
}

function hasMeet(event: GoogleEvent): boolean {
  return extractMeetUrl(event) !== null;
}

function eventBody(
  input: CalendarEventInput,
  attendees: CalendarAttendee[],
): Record<string, unknown> {
  const start = input.startsAt;
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
    attendees: attendees.map((attendee) =>
      attendee.name
        ? { email: attendee.email, displayName: attendee.name }
        : { email: attendee.email },
    ),
    // Interviewers and the candidate don't need to see each other's names/emails.
    guestsCanSeeOtherGuests: false,
    reminders: { useDefault: true },
  };
  if (input.withMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: input.requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return body;
}

/** Re-fetch a just-created/updated event while Meet creation is still "pending" (async, per Google's docs). */
async function resolvePendingMeet(
  env: Env,
  event: GoogleEvent,
  withMeet: boolean,
): Promise<GoogleEvent> {
  if (!withMeet) return event;
  let current = event;
  for (let attempt = 0; attempt < MEET_POLL_ATTEMPTS; attempt++) {
    const statusCode = current.conferenceData?.createRequest?.status?.statusCode;
    if (statusCode !== "pending") break;
    await sleep(pollDelayMs);
    const refreshed = await requestCalendar("GET", calendarUrl(env, current.id, ""));
    if (!refreshed.ok) break;
    current = refreshed.json as GoogleEvent;
  }
  return current;
}

function toEventResult(event: GoogleEvent): CalendarEventResult {
  return {
    ok: true,
    eventId: event.id,
    meetUrl: extractMeetUrl(event),
    htmlLink: event.htmlLink ?? null,
  };
}

// -------------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------------

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
  if (!isCalendarEnabled()) return { ok: false, reason: "disabled" };
  const env = getEnv();
  const attendees = calendarAttendees(input.attendees, env);

  logger.info(
    { event: "calendar.event.create", withMeet: input.withMeet, attendeeCount: attendees.length },
    "Creating Google Calendar event",
  );

  const result = await requestCalendar(
    "POST",
    calendarUrl(env, null, "?conferenceDataVersion=1&sendUpdates=all"),
    eventBody(input, attendees),
  );
  if (!result.ok) return result.failure;

  const event = await resolvePendingMeet(env, result.json as GoogleEvent, input.withMeet);
  return toEventResult(event);
}

export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  if (!isCalendarEnabled()) return { ok: false, reason: "disabled" };
  const env = getEnv();
  const attendees = calendarAttendees(input.attendees, env);

  // Only ask for a new Meet link if the event doesn't already have one (avoid duplicates).
  let withMeet = input.withMeet;
  if (withMeet) {
    const existing = await requestCalendar("GET", calendarUrl(env, eventId, ""));
    if (existing.ok && hasMeet(existing.json as GoogleEvent)) {
      withMeet = false;
    }
  }

  logger.info(
    { event: "calendar.event.update", eventId, withMeet, attendeeCount: attendees.length },
    "Updating Google Calendar event",
  );

  const result = await requestCalendar(
    "PATCH",
    calendarUrl(env, eventId, "?conferenceDataVersion=1&sendUpdates=all"),
    eventBody({ ...input, withMeet }, attendees),
  );
  if (!result.ok) return result.failure;

  const event = await resolvePendingMeet(env, result.json as GoogleEvent, withMeet);
  return toEventResult(event);
}

export async function cancelCalendarEvent(
  eventId: string,
): Promise<Result<object, CalendarFailure>> {
  if (!isCalendarEnabled()) return { ok: false, reason: "disabled" };
  const env = getEnv();

  logger.info({ event: "calendar.event.cancel", eventId }, "Cancelling Google Calendar event");

  const result = await requestCalendar("DELETE", calendarUrl(env, eventId, "?sendUpdates=all"));
  if (!result.ok) {
    if (result.status === 404 || result.status === 410) {
      logger.info(
        { event: "calendar.event.cancel_already_gone", eventId, status: result.status },
        "Google Calendar event was already deleted",
      );
      return { ok: true };
    }
    return result.failure;
  }
  return { ok: true };
}
