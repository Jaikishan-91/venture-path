import "server-only";
import type { CalendarSync } from "@/generated/prisma/client";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { runInBackground } from "./background";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { listInterviewerOptions } from "./team";
import {
  cancelCalendarEvent,
  createCalendarEvent,
  isCalendarEnabled,
  updateCalendarEvent,
} from "./google-calendar";
import { formatIndiaDateTime } from "./hiring/time";
import {
  MEET_STAGE_KINDS,
  STAGE_KIND_LABELS,
  type CalendarEventInput,
  type CalendarFailure,
  type Result,
  type ScheduleFailure,
  type ScheduleInput,
  type StageKind,
} from "./hiring/types";
import { parseScheduleInput } from "./scheduling-schemas";

/**
 * Scheduling interviews/tests on a listing's pipeline (WP4, D7): the organisation picks a time,
 * creates a Google Calendar event (Meet link only for `MEET_STAGE_KINDS`) on the platform account
 * (ADR-035), and VenturePath emails the candidate and interviewers. The DB row is written first;
 * Calendar sync and emails run afterwards in the background so a Calendar outage never blocks
 * scheduling (plan default: "Google Calendar not configured -> scheduling still works").
 */

const RETRY_ELIGIBLE_PENDING_MS = 60_000;

type EventInterviewerView = { userId: string; name: string; active: boolean };

export type ScheduledEventView = {
  id: string;
  stageId: string;
  stageName: string;
  startsAt: Date;
  durationMinutes: number;
  status: "scheduled" | "cancelled" | "completed";
  meetUrl: string | null;
  calendarSync: CalendarSync;
  calendarError: string | null;
  updatedAt: Date;
  interviewers: EventInterviewerView[];
};

export type CandidateEventView = {
  id: string;
  applicationId: string;
  stageName: string;
  stageKind: StageKind;
  instructions: string | null;
  externalUrl: string | null;
  listingTitle: string;
  businessName: string;
  startsAt: Date;
  durationMinutes: number;
  status: "scheduled" | "cancelled" | "completed";
  meetUrl: string | null;
};

// -------------------------------------------------------------------------------------------
// Shared helpers
// -------------------------------------------------------------------------------------------

function buildDescription(stage: {
  instructions: string | null;
  externalUrl: string | null;
}): string {
  const parts: string[] = [];
  if (stage.instructions) parts.push(stage.instructions);
  if (stage.externalUrl) parts.push(`Link: ${stage.externalUrl}`);
  parts.push("Times are shown in India Standard Time (IST).");
  return parts.join("\n\n");
}

const CALENDAR_ERROR_LABELS: Record<CalendarFailure, string> = {
  disabled: "Calendar not configured",
  auth: "Calendar authorization failed",
  http: "Calendar request failed",
  timeout: "Calendar request timed out",
  network: "Calendar network error",
};

function shortCalendarError(reason: CalendarFailure, message?: string): string {
  const label = CALENDAR_ERROR_LABELS[reason];
  return (message ? `${label}: ${message}` : label).slice(0, 200);
}

/** Everything needed to build a calendar event or a notification email for one scheduled event. */
async function loadEventDetail(eventId: string) {
  return getDb().scheduledEvent.findUnique({
    where: { id: eventId },
    include: {
      stage: {
        select: { id: true, name: true, kind: true, instructions: true, externalUrl: true },
      },
      application: {
        select: {
          userProfile: { select: { user: { select: { name: true, email: true } } } },
          opportunity: {
            select: {
              id: true,
              title: true,
              organisationProfile: { select: { userId: true, businessName: true } },
            },
          },
        },
      },
      interviewers: { select: { userId: true, user: { select: { name: true, email: true } } } },
    },
  });
}

type EventDetail = NonNullable<Awaited<ReturnType<typeof loadEventDetail>>>;

/**
 * Create or update the Google Calendar event for a scheduled event and persist the result.
 * Idempotent and safe to re-run (retry, or repeated background triggers).
 */
export async function syncEventToCalendar(
  eventId: string,
): Promise<{ calendarSync: CalendarSync } | null> {
  const event = await loadEventDetail(eventId);
  if (!event || event.status === "cancelled") return null;

  const input: CalendarEventInput = {
    requestId: event.id,
    summary: `${event.stage.name} · ${event.application.opportunity.title} · ${event.application.opportunity.organisationProfile.businessName}`,
    description: buildDescription(event.stage),
    startsAt: event.startsAt,
    durationMinutes: event.durationMinutes,
    attendees: [
      {
        email: event.application.userProfile.user.email,
        name: event.application.userProfile.user.name,
      },
      ...event.interviewers.map((interviewer) => ({
        email: interviewer.user.email,
        name: interviewer.user.name,
      })),
    ],
    withMeet: MEET_STAGE_KINDS.includes(event.stage.kind),
  };

  const result = event.googleEventId
    ? await updateCalendarEvent(event.googleEventId, input)
    : await createCalendarEvent(input);

  if (result.ok) {
    await getDb().scheduledEvent.update({
      where: { id: eventId },
      data: {
        googleEventId: result.eventId,
        meetUrl: result.meetUrl,
        calendarSync: "synced",
        calendarError: null,
      },
    });
    return { calendarSync: "synced" };
  }

  if (result.reason === "disabled") {
    await getDb().scheduledEvent.update({
      where: { id: eventId },
      data: { calendarSync: "disabled", calendarError: null },
    });
    return { calendarSync: "disabled" };
  }

  getLogger().warn({ eventId, reason: result.reason }, "calendar sync failed for scheduled event");
  await getDb().scheduledEvent.update({
    where: { id: eventId },
    data: {
      calendarSync: "failed",
      calendarError: shortCalendarError(result.reason, result.message),
    },
  });
  return { calendarSync: "failed" };
}

type EmailKind = "scheduled" | "rescheduled" | "cancelled";

function eventUrlFor(event: EventDetail, forUserId: string): string {
  const base = getEnv().BETTER_AUTH_URL;
  const isOwner = event.application.opportunity.organisationProfile.userId === forUserId;
  return isOwner
    ? `${base}/organisation/opportunities/${event.application.opportunity.id}/applicants`
    : `${base}/hiring-manager/interviews/${event.id}`;
}

/** Sends the "what/when/duration/Meet link" email to the candidate and every interviewer. */
async function sendScheduleEmails(eventId: string, kind: EmailKind): Promise<void> {
  const event = await loadEventDetail(eventId);
  if (!event) return;

  const stageLabel = STAGE_KIND_LABELS[event.stage.kind];
  const when = formatIndiaDateTime(event.startsAt);
  const verb =
    kind === "cancelled" ? "cancelled" : kind === "rescheduled" ? "rescheduled" : "scheduled";
  const listingTitle = event.application.opportunity.title;
  const businessName = event.application.opportunity.organisationProfile.businessName;
  const meetLine = event.meetUrl
    ? `Join: ${event.meetUrl}`
    : MEET_STAGE_KINDS.includes(event.stage.kind)
      ? "The meeting link will be sent in a calendar invite."
      : "-";

  const candidateLines = [
    `Your ${event.stage.name} (${stageLabel}) for ${listingTitle} at ${businessName} has been ${verb}.`,
    `When: ${when}`,
    `Duration: ${event.durationMinutes} minutes`,
  ];
  if (kind !== "cancelled") {
    candidateLines.push(meetLine);
    if (event.stage.instructions) candidateLines.push(event.stage.instructions);
    if (event.stage.externalUrl) candidateLines.push(`Link: ${event.stage.externalUrl}`);
  }
  candidateLines.push(`${getEnv().BETTER_AUTH_URL}/user/applications`);

  await sendEmail({
    to: event.application.userProfile.user.email,
    subject: `${event.stage.name} ${verb}: ${listingTitle}`,
    text: candidateLines.join("\n\n"),
  });

  for (const interviewer of event.interviewers) {
    const lines = [
      `${event.stage.name} (${stageLabel}) with a candidate for ${listingTitle} has been ${verb}.`,
      `When: ${when}`,
      `Duration: ${event.durationMinutes} minutes`,
    ];
    if (kind !== "cancelled") lines.push(meetLine);
    lines.push(eventUrlFor(event, interviewer.userId));

    await sendEmail({
      to: interviewer.user.email,
      subject: `${event.stage.name} ${verb}: ${listingTitle}`,
      text: lines.join("\n\n"),
    });
  }
}

async function notifyRemovedInterviewers(
  eventId: string,
  userIds: string[],
  context: { stageName: string; listingTitle: string; businessName: string },
): Promise<void> {
  if (userIds.length === 0) return;
  const users = await getDb().user.findMany({
    where: { id: { in: userIds } },
    select: { email: true, name: true },
  });
  for (const user of users) {
    await sendEmail({
      to: user.email,
      subject: `Removed from ${context.stageName}: ${context.listingTitle}`,
      text: `You've been removed as an interviewer for ${context.stageName} for ${context.listingTitle} at ${context.businessName}. No action is needed.`,
    });
  }
}

/** Cancels the calendar event (if any) and sends cancellation emails. Assumes the row is already `cancelled`. */
async function finishCancellation(eventId: string): Promise<void> {
  const event = await getDb().scheduledEvent.findUnique({
    where: { id: eventId },
    select: { googleEventId: true },
  });
  if (event?.googleEventId) {
    const result = await cancelCalendarEvent(event.googleEventId);
    if (!result.ok) {
      getLogger().warn({ eventId, reason: result.reason }, "calendar cancel failed");
    }
  }
  await sendScheduleEmails(eventId, "cancelled");
}

/**
 * Cancels every future `scheduled` event for an application (used when it leaves `submitted`:
 * accepted, rejected — directly or via `pipeline-progress` — or withdrawn). Not org-scoped:
 * callers must have already authorized the state change that triggers this.
 */
export async function cancelFutureEventsForApplication(
  applicationId: string,
  now: Date = new Date(),
): Promise<void> {
  const events = await getDb().scheduledEvent.findMany({
    where: { applicationId, status: "scheduled", startsAt: { gt: now } },
    select: { id: true },
  });
  for (const event of events) {
    const { count } = await getDb().scheduledEvent.updateMany({
      where: { id: event.id, status: "scheduled" },
      data: { status: "cancelled" },
    });
    if (count > 0) {
      runInBackground("cancel scheduled event", { eventId: event.id }, () =>
        finishCancellation(event.id),
      );
    }
  }
}

/**
 * Cancels future `scheduled` events of one stage for an application (used when the candidate
 * advances past that stage).
 */
export async function cancelFutureEventsForStage(
  applicationId: string,
  stageId: string,
  now: Date = new Date(),
): Promise<void> {
  const events = await getDb().scheduledEvent.findMany({
    where: { applicationId, stageId, status: "scheduled", startsAt: { gt: now } },
    select: { id: true },
  });
  for (const event of events) {
    const { count } = await getDb().scheduledEvent.updateMany({
      where: { id: event.id, status: "scheduled" },
      data: { status: "cancelled" },
    });
    if (count > 0) {
      runInBackground("cancel scheduled event", { eventId: event.id }, () =>
        finishCancellation(event.id),
      );
    }
  }
}

// -------------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------------

/** Schedules an interview/test slot for a candidate currently at `input.stageId` (D7). */
export async function scheduleEvent(
  orgUserId: string,
  input: ScheduleInput,
): Promise<Result<{ eventId: string }, ScheduleFailure>> {
  const db = getDb();
  const application = await db.application.findFirst({
    where: { id: input.applicationId, opportunity: { organisationProfile: { userId: orgUserId } } },
    select: { id: true, status: true, currentStageId: true, opportunityId: true },
  });
  if (!application) return { ok: false, reason: "not_found" };

  const stage = await db.pipelineStage.findFirst({
    where: { id: input.stageId, opportunityId: application.opportunityId },
    select: { id: true, kind: true },
  });
  if (!stage) return { ok: false, reason: "invalid" };

  const parsed = parseScheduleInput(input, stage.kind);
  if (!parsed.ok) return parsed;

  if (application.status !== "submitted" || application.currentStageId !== stage.id) {
    return { ok: false, reason: "wrong_stage" };
  }

  if (parsed.interviewerUserIds.length > 0) {
    const options = await listInterviewerOptions(orgUserId);
    const validIds = new Set(options.map((option) => option.userId));
    if (parsed.interviewerUserIds.some((id) => !validIds.has(id))) {
      return { ok: false, reason: "bad_interviewer" };
    }
  }

  const now = new Date();
  const duplicate = await db.scheduledEvent.findFirst({
    where: {
      applicationId: input.applicationId,
      stageId: stage.id,
      status: "scheduled",
      startsAt: { gt: now },
    },
    select: { id: true },
  });
  if (duplicate) {
    return {
      ok: false,
      reason: "invalid",
      message: "This candidate already has a future event for this stage. Reschedule it instead.",
    };
  }

  const calendarSync: CalendarSync = isCalendarEnabled() ? "pending" : "disabled";
  const created = await db.scheduledEvent.create({
    data: {
      applicationId: input.applicationId,
      stageId: stage.id,
      startsAt: parsed.startsAt,
      durationMinutes: parsed.durationMinutes,
      calendarSync,
      createdById: orgUserId,
      interviewers: { create: parsed.interviewerUserIds.map((userId) => ({ userId })) },
    },
    select: { id: true },
  });

  getLogger().info(
    { orgUserId, applicationId: input.applicationId, eventId: created.id },
    "event scheduled",
  );
  runInBackground("schedule sync", { eventId: created.id }, async () => {
    await syncEventToCalendar(created.id);
    await sendScheduleEmails(created.id, "scheduled");
  });
  return { ok: true, eventId: created.id };
}

/** Reschedules a future `scheduled` event: new time/duration/interviewers, conditional on `updatedAt`. */
export async function rescheduleEvent(
  orgUserId: string,
  eventId: string,
  input: {
    startsAtLocal: string;
    durationMinutes: number;
    interviewerUserIds: string[];
    expectedUpdatedAt: Date;
  },
): Promise<Result<object, ScheduleFailure>> {
  const db = getDb();
  const event = await db.scheduledEvent.findFirst({
    where: {
      id: eventId,
      application: { opportunity: { organisationProfile: { userId: orgUserId } } },
    },
    select: {
      id: true,
      status: true,
      applicationId: true,
      stageId: true,
      stage: { select: { kind: true, name: true } },
      application: {
        select: {
          opportunity: {
            select: { title: true, organisationProfile: { select: { businessName: true } } },
          },
        },
      },
      interviewers: { select: { userId: true } },
    },
  });
  if (!event) return { ok: false, reason: "not_found" };
  if (event.status !== "scheduled") return { ok: false, reason: "invalid" };

  const parsed = parseScheduleInput(input, event.stage.kind);
  if (!parsed.ok) return parsed;

  if (parsed.interviewerUserIds.length > 0) {
    const options = await listInterviewerOptions(orgUserId);
    const validIds = new Set(options.map((option) => option.userId));
    if (parsed.interviewerUserIds.some((id) => !validIds.has(id))) {
      return { ok: false, reason: "bad_interviewer" };
    }
  }

  const now = new Date();
  const duplicate = await db.scheduledEvent.findFirst({
    where: {
      id: { not: eventId },
      applicationId: event.applicationId,
      stageId: event.stageId,
      status: "scheduled",
      startsAt: { gt: now },
    },
    select: { id: true },
  });
  if (duplicate) {
    return {
      ok: false,
      reason: "invalid",
      message: "This candidate already has another future event for this stage.",
    };
  }

  const previousInterviewerIds = event.interviewers.map((interviewer) => interviewer.userId);
  const removedIds = previousInterviewerIds.filter((id) => !parsed.interviewerUserIds.includes(id));

  const count = await db.$transaction(async (tx) => {
    const updateResult = await tx.scheduledEvent.updateMany({
      where: { id: eventId, status: "scheduled", updatedAt: input.expectedUpdatedAt },
      data: { startsAt: parsed.startsAt, durationMinutes: parsed.durationMinutes },
    });
    if (updateResult.count === 0) return 0;
    await tx.eventInterviewer.deleteMany({ where: { scheduledEventId: eventId } });
    if (parsed.interviewerUserIds.length > 0) {
      await tx.eventInterviewer.createMany({
        data: parsed.interviewerUserIds.map((userId) => ({ scheduledEventId: eventId, userId })),
      });
    }
    return updateResult.count;
  });
  if (count === 0) return { ok: false, reason: "stale" };

  getLogger().info({ orgUserId, eventId }, "event rescheduled");
  runInBackground("reschedule sync", { eventId }, async () => {
    await syncEventToCalendar(eventId);
    await sendScheduleEmails(eventId, "rescheduled");
    await notifyRemovedInterviewers(eventId, removedIds, {
      stageName: event.stage.name,
      listingTitle: event.application.opportunity.title,
      businessName: event.application.opportunity.organisationProfile.businessName,
    });
  });
  return { ok: true };
}

/** Cancels a future `scheduled` event: Calendar delete + cancellation emails in the background. */
export async function cancelScheduledEvent(
  orgUserId: string,
  eventId: string,
): Promise<Result<object, ScheduleFailure>> {
  const event = await getDb().scheduledEvent.findFirst({
    where: {
      id: eventId,
      application: { opportunity: { organisationProfile: { userId: orgUserId } } },
    },
    select: { id: true, status: true },
  });
  if (!event) return { ok: false, reason: "not_found" };
  if (event.status !== "scheduled") return { ok: false, reason: "invalid" };

  const { count } = await getDb().scheduledEvent.updateMany({
    where: { id: eventId, status: "scheduled" },
    data: { status: "cancelled" },
  });
  if (count === 0) return { ok: false, reason: "stale" };

  getLogger().info({ orgUserId, eventId }, "event cancelled");
  runInBackground("cancel scheduled event", { eventId }, () => finishCancellation(eventId));
  return { ok: true };
}

/** Retries Calendar sync for a `failed` event, or a `pending` one stuck for over a minute. Awaited. */
export async function retryCalendarSync(
  orgUserId: string,
  eventId: string,
): Promise<Result<{ calendarSync: CalendarSync }, ScheduleFailure>> {
  const event = await getDb().scheduledEvent.findFirst({
    where: {
      id: eventId,
      application: { opportunity: { organisationProfile: { userId: orgUserId } } },
    },
    select: { id: true, status: true, calendarSync: true, updatedAt: true },
  });
  if (!event) return { ok: false, reason: "not_found" };
  if (event.status !== "scheduled") return { ok: false, reason: "invalid" };
  const pendingStuck =
    event.calendarSync === "pending" &&
    Date.now() - event.updatedAt.getTime() > RETRY_ELIGIBLE_PENDING_MS;
  if (event.calendarSync !== "failed" && !pendingStuck) {
    return { ok: false, reason: "invalid" };
  }

  const result = await syncEventToCalendar(eventId);
  if (!result) return { ok: false, reason: "not_found" };
  return { ok: true, calendarSync: result.calendarSync };
}

/** Scheduled events for a set of applications, for the applicants page. Org-scoped. */
export async function listEventsForApplications(
  orgUserId: string,
  applicationIds: string[],
): Promise<Map<string, ScheduledEventView[]>> {
  const byApplication = new Map<string, ScheduledEventView[]>();
  if (applicationIds.length === 0) return byApplication;

  const [events, interviewerOptions] = await Promise.all([
    getDb().scheduledEvent.findMany({
      where: {
        applicationId: { in: applicationIds },
        application: { opportunity: { organisationProfile: { userId: orgUserId } } },
      },
      orderBy: { startsAt: "asc" },
      include: {
        stage: { select: { name: true } },
        interviewers: { select: { userId: true, user: { select: { name: true } } } },
      },
    }),
    listInterviewerOptions(orgUserId),
  ]);
  const activeIds = new Set(interviewerOptions.map((option) => option.userId));

  for (const event of events) {
    const view: ScheduledEventView = {
      id: event.id,
      stageId: event.stageId,
      stageName: event.stage.name,
      startsAt: event.startsAt,
      durationMinutes: event.durationMinutes,
      status: event.status,
      meetUrl: event.meetUrl,
      calendarSync: event.calendarSync,
      calendarError: event.calendarError,
      updatedAt: event.updatedAt,
      interviewers: event.interviewers.map((interviewer) => ({
        userId: interviewer.userId,
        name: interviewer.user.name,
        active: activeIds.has(interviewer.userId),
      })),
    };
    const list = byApplication.get(event.applicationId) ?? [];
    list.push(view);
    byApplication.set(event.applicationId, list);
  }
  return byApplication;
}

/**
 * A candidate's own non-cancelled scheduled events, future first then most-recent-past, with no
 * interviewer emails, feedback or scores.
 */
export async function listUpcomingEventsForCandidate(
  applicantUserId: string,
): Promise<CandidateEventView[]> {
  const now = new Date();
  const events = await getDb().scheduledEvent.findMany({
    where: {
      status: { not: "cancelled" },
      application: { userProfile: { userId: applicantUserId } },
    },
    include: {
      stage: { select: { name: true, kind: true, instructions: true, externalUrl: true } },
      application: {
        select: {
          opportunity: {
            select: { title: true, organisationProfile: { select: { businessName: true } } },
          },
        },
      },
    },
  });

  const future = events
    .filter((event) => event.startsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = events
    .filter((event) => event.startsAt <= now)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return [...future, ...past].map((event) => ({
    id: event.id,
    applicationId: event.applicationId,
    stageName: event.stage.name,
    stageKind: event.stage.kind,
    instructions: event.stage.instructions,
    externalUrl: event.stage.externalUrl,
    listingTitle: event.application.opportunity.title,
    businessName: event.application.opportunity.organisationProfile.businessName,
    startsAt: event.startsAt,
    durationMinutes: event.durationMinutes,
    status: event.status,
    meetUrl: event.meetUrl,
  }));
}
