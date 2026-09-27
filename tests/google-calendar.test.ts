import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/env";
import type { CalendarAttendee, CalendarEventInput } from "@/lib/hiring/types";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  vi.unstubAllGlobals();
});

/**
 * Fresh module graph per test, so `getEnv()`'s cache and the module-scoped poll delay reset.
 * The access-token cache lives on `globalThis` by design (like the other singletons in
 * `src/lib`), so it survives `vi.resetModules()` — clear it explicitly for test isolation.
 */
async function loadCalendar() {
  vi.resetModules();
  const mod = await import("@/lib/google-calendar");
  mod.setCalendarPollDelayForTests(0); // no real waiting for the pending-Meet poll in tests
  mod.clearCalendarTokenCache();
  return mod;
}

function setCalendarEnv(overrides: Record<string, string> = {}) {
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
    GOOGLE_CALENDAR_ID: "primary",
    ...overrides,
  });
}

function tokenResponse(
  overrides: Partial<{ access_token: string; expires_in: number }> = {},
): Response {
  return Response.json({ access_token: "access-token", expires_in: 3600, ...overrides });
}

function eventResponse(fields: Record<string, unknown> & { id: string }): Response {
  return Response.json(fields);
}

function baseInput(overrides: Partial<CalendarEventInput> = {}): CalendarEventInput {
  return {
    requestId: "req-1",
    summary: "Interview",
    description: "First round",
    startsAt: new Date("2026-10-01T04:30:00.000Z"),
    durationMinutes: 30,
    attendees: [{ email: "candidate@example.com", name: "Candidate" }],
    withMeet: true,
    ...overrides,
  };
}

describe("isCalendarEnabled / disabled behaviour", () => {
  it("is disabled and makes no network call when the env vars are missing", async () => {
    setCalendarEnv({
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_CALENDAR_REFRESH_TOKEN: "",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { isCalendarEnabled, createCalendarEvent, cancelCalendarEvent } = await loadCalendar();
    expect(isCalendarEnabled()).toBe(false);
    expect(await createCalendarEvent(baseInput())).toEqual({ ok: false, reason: "disabled" });
    expect(await cancelCalendarEvent("evt1")).toEqual({ ok: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is enabled only when client id, secret and refresh token are all set", async () => {
    setCalendarEnv({ GOOGLE_CALENDAR_REFRESH_TOKEN: "" });
    const { isCalendarEnabled } = await loadCalendar();
    expect(isCalendarEnabled()).toBe(false);
  });
});

describe("calendarAttendees", () => {
  it("drops reserved-domain attendees and dedupes by lowercased email outside production", async () => {
    const { calendarAttendees } = await loadCalendar();
    const env = { NODE_ENV: "test" } as unknown as Env;
    const attendees: CalendarAttendee[] = [
      { email: "Candidate@Example.com", name: "Candidate" },
      { email: "candidate@example.com" },
      { email: "org@example.local", name: "Org" },
    ];
    expect(calendarAttendees(attendees, env)).toEqual([
      { email: "candidate@example.com", name: "Candidate" },
    ]);
  });

  it("keeps reserved-domain attendees in production", async () => {
    const { calendarAttendees } = await loadCalendar();
    const env = { NODE_ENV: "production" } as unknown as Env;
    const attendees: CalendarAttendee[] = [{ email: "org@example.local", name: "Org" }];
    expect(calendarAttendees(attendees, env)).toEqual([
      { email: "org@example.local", name: "Org" },
    ]);
  });
});

describe("access token", () => {
  it("fetches once and caches the token across two events", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(eventResponse({ id: "evt1" }))
      .mockResolvedValueOnce(eventResponse({ id: "evt2" }));
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    const first = await createCalendarEvent(baseInput({ withMeet: false }));
    const second = await createCalendarEvent(baseInput({ withMeet: false, requestId: "req-2" }));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const tokenCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://oauth2.googleapis.com/token",
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("maps invalid_grant / 400 / 401 from the token endpoint to auth", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    expect(await createCalendarEvent(baseInput())).toEqual({ ok: false, reason: "auth" });
  });

  it("never logs the access token or refresh token", async () => {
    setCalendarEnv({ GOOGLE_CALENDAR_REFRESH_TOKEN: "super-secret-refresh-token" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ access_token: "super-secret-access-token" }))
      .mockResolvedValueOnce(eventResponse({ id: "evt1" }));
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    const { getLogger } = await import("@/lib/logger");
    const logger = getLogger();
    const infoSpy = vi.spyOn(logger, "info");
    const warnSpy = vi.spyOn(logger, "warn");

    await createCalendarEvent(baseInput({ withMeet: false }));

    const logged = JSON.stringify([...infoSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(logged).not.toContain("super-secret-access-token");
    expect(logged).not.toContain("super-secret-refresh-token");
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("createCalendarEvent", () => {
  it("creates an event with an immediate Meet link", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        eventResponse({
          id: "evt1",
          htmlLink: "https://calendar.google.com/evt1",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
          conferenceData: { createRequest: { status: { statusCode: "success" } } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    const result = await createCalendarEvent(baseInput({ withMeet: true }));

    expect(result).toEqual({
      ok: true,
      eventId: "evt1",
      meetUrl: "https://meet.google.com/abc-defg-hij",
      htmlLink: "https://calendar.google.com/evt1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(
      (body.conferenceData as { createRequest: { requestId: string } }).createRequest.requestId,
    ).toBe("req-1");
  });

  it("polls for a pending Meet link until it's ready", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        eventResponse({
          id: "evt1",
          conferenceData: { createRequest: { status: { statusCode: "pending" } } },
        }),
      )
      .mockResolvedValueOnce(
        eventResponse({
          id: "evt1",
          hangoutLink: "https://meet.google.com/ready",
          conferenceData: { createRequest: { status: { statusCode: "success" } } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    const result = await createCalendarEvent(baseInput({ withMeet: true }));

    expect(result).toMatchObject({
      ok: true,
      eventId: "evt1",
      meetUrl: "https://meet.google.com/ready",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not request a Meet link when withMeet is false", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(eventResponse({ id: "evt1" }));
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    const result = await createCalendarEvent(baseInput({ withMeet: false }));

    expect(result).toEqual({ ok: true, eventId: "evt1", meetUrl: null, htmlLink: null });
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.conferenceData).toBeUndefined();
  });

  it("posts to the right URL with conferenceDataVersion=1 and sendUpdates=all", async () => {
    setCalendarEnv({ GOOGLE_CALENDAR_ID: "team@example.com" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(eventResponse({ id: "evt1" }));
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    await createCalendarEvent(baseInput({ withMeet: false }));

    const [url] = fetchMock.mock.calls[1] as [string];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/team%40example.com/events?conferenceDataVersion=1&sendUpdates=all",
    );
  });

  it("maps a 5xx from the Calendar API to http with Google's error message", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        Response.json({ error: { message: "Backend error" } }, { status: 500 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    expect(await createCalendarEvent(baseInput({ withMeet: false }))).toEqual({
      ok: false,
      reason: "http",
      message: "Backend error",
    });
  });

  it("maps a timed-out request to timeout", async () => {
    setCalendarEnv();
    const timeoutError = Object.assign(new Error("The operation timed out"), {
      name: "TimeoutError",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockRejectedValueOnce(timeoutError);
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    expect(await createCalendarEvent(baseInput({ withMeet: false }))).toEqual({
      ok: false,
      reason: "timeout",
    });
  });

  it("maps a network failure to network", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    expect(await createCalendarEvent(baseInput({ withMeet: false }))).toEqual({
      ok: false,
      reason: "network",
    });
  });

  it("clears the cached token and retries once on a 401, then succeeds", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ access_token: "token-1" }))
      .mockResolvedValueOnce(
        Response.json({ error: { message: "Invalid Credentials" } }, { status: 401 }),
      )
      .mockResolvedValueOnce(tokenResponse({ access_token: "token-2" }))
      .mockResolvedValueOnce(eventResponse({ id: "evt1" }));
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    const result = await createCalendarEvent(baseInput({ withMeet: false }));

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, secondAttemptInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect((secondAttemptInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-2",
    );
  });

  it("returns auth when a 401 persists after the retry", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ access_token: "token-1" }))
      .mockResolvedValueOnce(
        Response.json({ error: { message: "Invalid Credentials" } }, { status: 401 }),
      )
      .mockResolvedValueOnce(tokenResponse({ access_token: "token-2" }))
      .mockResolvedValueOnce(
        Response.json({ error: { message: "Invalid Credentials" } }, { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createCalendarEvent } = await loadCalendar();
    expect(await createCalendarEvent(baseInput({ withMeet: false }))).toEqual({
      ok: false,
      reason: "auth",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("updateCalendarEvent", () => {
  it("adds a Meet link when the event doesn't have one yet", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(eventResponse({ id: "evt1" }))
      .mockResolvedValueOnce(
        eventResponse({ id: "evt1", hangoutLink: "https://meet.google.com/new" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { updateCalendarEvent } = await loadCalendar();
    const result = await updateCalendarEvent("evt1", baseInput({ withMeet: true }));

    expect(result).toEqual({
      ok: true,
      eventId: "evt1",
      meetUrl: "https://meet.google.com/new",
      htmlLink: null,
    });
    const [patchUrl, patchInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(patchUrl).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/evt1?conferenceDataVersion=1&sendUpdates=all",
    );
    const body = JSON.parse(patchInit.body as string) as Record<string, unknown>;
    expect((body.conferenceData as { createRequest: unknown }).createRequest).toBeTruthy();
  });

  it("does not re-request Meet when the event already has one", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        eventResponse({ id: "evt1", hangoutLink: "https://meet.google.com/existing" }),
      )
      .mockResolvedValueOnce(
        eventResponse({ id: "evt1", hangoutLink: "https://meet.google.com/existing" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { updateCalendarEvent } = await loadCalendar();
    await updateCalendarEvent("evt1", baseInput({ withMeet: true }));

    const [, patchInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    const body = JSON.parse(patchInit.body as string) as Record<string, unknown>;
    expect(body.conferenceData).toBeUndefined();
  });
});

describe("cancelCalendarEvent", () => {
  it("deletes an event with sendUpdates=all", async () => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { cancelCalendarEvent } = await loadCalendar();
    expect(await cancelCalendarEvent("evt1")).toEqual({ ok: true });
    const [url] = fetchMock.mock.calls[1] as [string];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/evt1?sendUpdates=all",
    );
  });

  it.each([404, 410])("treats a %i as already cancelled", async (status) => {
    setCalendarEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(Response.json({ error: { message: "Not Found" } }, { status }));
    vi.stubGlobal("fetch", fetchMock);

    const { cancelCalendarEvent } = await loadCalendar();
    expect(await cancelCalendarEvent("evt1")).toEqual({ ok: true });
  });
});
