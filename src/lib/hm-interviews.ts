import "server-only";
import type { ScheduleStatus, StageKind } from "@/generated/prisma/client";
import { getDb } from "./db";
import { getActiveMembership } from "./team";
import { formatIndiaDateTime } from "./hiring/time";
import type { Recommendation } from "./hiring/types";

/**
 * Hiring-manager-facing reads of scheduled interviews (WP5, D4 in
 * `plan/2026-09-26-hiring-pipelines-and-interviews.md`).
 *
 * D4 authorization rule, enforced by every query here: an HM may see a `ScheduledEvent` iff they
 * are an `EventInterviewer` on it AND the event's application -> opportunity ->
 * organisationProfileId equals the caller's ACTIVE membership's organisationProfileId. Callers
 * pass `organisationProfileId` from `requireActiveHiringManager()`, which already redirects a
 * deactivated or missing membership away before any of these functions run — so a deactivated HM
 * never reaches them with a live org id. Anything outside the rule (wrong org, unassigned event,
 * unknown id) comes back as `null` / an empty list / `false`, never a distinguishable error.
 */

const PAST_EVENTS_LIMIT = 50;

function assignedTo(userId: string, organisationProfileId: string) {
  return {
    interviewers: { some: { userId } },
    application: { opportunity: { organisationProfileId } },
  };
}

function endsAtMs(event: { startsAt: Date; durationMinutes: number }): number {
  return event.startsAt.getTime() + event.durationMinutes * 60_000;
}

export type AssignedEventSummary = {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  status: ScheduleStatus;
  meetUrl: string | null;
  stageName: string;
  stageKind: StageKind;
  listingTitle: string;
  candidateName: string;
  /** Names of the event's other interviewers (never includes the caller). */
  otherInterviewers: string[];
  feedbackSubmitted: boolean;
};

const SUMMARY_SELECT = {
  id: true,
  startsAt: true,
  durationMinutes: true,
  status: true,
  meetUrl: true,
  stage: { select: { name: true, kind: true } },
  application: {
    select: {
      opportunity: { select: { title: true } },
      userProfile: { select: { user: { select: { name: true } } } },
    },
  },
  interviewers: { select: { userId: true, user: { select: { name: true } } } },
  feedback: { select: { interviewerUserId: true } },
} as const;

type SummaryRow = {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  status: ScheduleStatus;
  meetUrl: string | null;
  stage: { name: string; kind: StageKind };
  application: { opportunity: { title: string }; userProfile: { user: { name: string } } };
  interviewers: { userId: string; user: { name: string } }[];
  feedback: { interviewerUserId: string }[];
};

function toSummary(row: SummaryRow, userId: string): AssignedEventSummary {
  return {
    id: row.id,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    status: row.status,
    meetUrl: row.meetUrl,
    stageName: row.stage.name,
    stageKind: row.stage.kind,
    listingTitle: row.application.opportunity.title,
    candidateName: row.application.userProfile.user.name,
    otherInterviewers: row.interviewers
      .filter((interviewer) => interviewer.userId !== userId)
      .map((interviewer) => interviewer.user.name),
    feedbackSubmitted: row.feedback.some((entry) => entry.interviewerUserId === userId),
  };
}

/**
 * Events assigned to `userId` within the caller's active organisation (D4). `upcoming` is
 * ascending by start time and excludes cancelled events whose end time has passed; `past` is
 * descending and capped, and includes cancelled events regardless of time.
 */
export async function listAssignedEvents(
  userId: string,
  organisationProfileId: string,
  { scope }: { scope: "upcoming" | "past" | "all" },
  now = new Date(),
): Promise<AssignedEventSummary[]> {
  const rows = await getDb().scheduledEvent.findMany({
    where: assignedTo(userId, organisationProfileId),
    select: SUMMARY_SELECT,
  });
  const events = rows.map((row) => toSummary(row, userId));
  const nowMs = now.getTime();

  const upcoming = events
    .filter((event) => event.status !== "cancelled" && endsAtMs(event) >= nowMs)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = events
    .filter((event) => event.status === "cancelled" || endsAtMs(event) < nowMs)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, PAST_EVENTS_LIMIT);

  if (scope === "upcoming") return upcoming;
  if (scope === "past") return past;
  return [...upcoming, ...past];
}

export type ScreeningAnswer = { prompt: string; answer: string };

export type AssignedEventDetail = AssignedEventSummary & {
  applicationId: string;
  stageInstructions: string | null;
  stageExternalUrl: string | null;
  listingDescription: string;
  listingRequirements: string | null;
  listingSkills: string[];
  candidateInstitution: string;
  candidateCourse: string;
  resumeFileName: string;
  screeningAnswers: ScreeningAnswer[];
  myFeedback: {
    rating: number;
    recommendation: Recommendation;
    notes: string;
    submittedAt: Date;
    updatedAt: Date;
  } | null;
};

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  stage: { select: { name: true, kind: true, instructions: true, externalUrl: true } },
  application: {
    select: {
      id: true,
      resumeFileName: true,
      opportunity: { select: { title: true, description: true, requirements: true, skills: true } },
      userProfile: {
        select: { institution: true, course: true, user: { select: { name: true } } },
      },
      answers: {
        select: { answer: true, question: { select: { prompt: true, position: true } } },
        orderBy: { question: { position: "asc" } },
      },
    },
  },
  feedback: {
    select: {
      interviewerUserId: true,
      rating: true,
      recommendation: true,
      notes: true,
      submittedAt: true,
      updatedAt: true,
    },
  },
} as const;

type DetailRow = Omit<SummaryRow, "stage" | "application" | "feedback"> & {
  stage: { name: string; kind: StageKind; instructions: string | null; externalUrl: string | null };
  application: {
    id: string;
    resumeFileName: string;
    opportunity: {
      title: string;
      description: string;
      requirements: string | null;
      skills: string[];
    };
    userProfile: { institution: string; course: string; user: { name: string } };
    answers: { answer: string; question: { prompt: string; position: number } }[];
  };
  feedback: {
    interviewerUserId: string;
    rating: number;
    recommendation: Recommendation;
    notes: string;
    submittedAt: Date;
    updatedAt: Date;
  }[];
};

function toDetail(row: DetailRow, userId: string): AssignedEventDetail {
  const mine = row.feedback.find((entry) => entry.interviewerUserId === userId) ?? null;
  return {
    ...toSummary(row, userId),
    stageInstructions: row.stage.instructions,
    stageExternalUrl: row.stage.externalUrl,
    applicationId: row.application.id,
    listingDescription: row.application.opportunity.description,
    listingRequirements: row.application.opportunity.requirements,
    listingSkills: row.application.opportunity.skills,
    candidateInstitution: row.application.userProfile.institution,
    candidateCourse: row.application.userProfile.course,
    resumeFileName: row.application.resumeFileName,
    screeningAnswers: row.application.answers
      .slice()
      .sort((a, b) => a.question.position - b.question.position)
      .map((answer) => ({ prompt: answer.question.prompt, answer: answer.answer })),
    myFeedback: mine
      ? {
          rating: mine.rating,
          recommendation: mine.recommendation,
          notes: mine.notes,
          submittedAt: mine.submittedAt,
          updatedAt: mine.updatedAt,
        }
      : null,
  };
}

/** Full detail for one assigned event (D4), or `null` for anything outside the rule (never candidate email or AI scores). */
export async function getAssignedEvent(
  userId: string,
  organisationProfileId: string,
  eventId: string,
): Promise<AssignedEventDetail | null> {
  const row = await getDb().scheduledEvent.findFirst({
    where: { id: eventId, ...assignedTo(userId, organisationProfileId) },
    select: DETAIL_SELECT,
  });
  if (!row) return null;
  return toDetail(row as DetailRow, userId);
}

/**
 * Whether `userId` (an active hiring manager) may read the resume for `applicationId`: assigned
 * to a non-cancelled event on that application, within their own active organisation (D4).
 */
export async function canHiringManagerReadResume(
  userId: string,
  applicationId: string,
): Promise<boolean> {
  const membership = await getActiveMembership(userId);
  if (!membership) return false;

  const event = await getDb().scheduledEvent.findFirst({
    where: {
      applicationId,
      status: { not: "cancelled" },
      ...assignedTo(userId, membership.organisationProfileId),
    },
    select: { id: true },
  });
  return event !== null;
}

/** The stored resume file for an application, for the resume route once access is confirmed. */
export async function getApplicationResumeFile(
  applicationId: string,
): Promise<{ resumeFileName: string; resumeStorageKey: string } | null> {
  return getDb().application.findUnique({
    where: { id: applicationId },
    select: { resumeFileName: true, resumeStorageKey: true },
  });
}

/**
 * Why the feedback form should be disabled for this event, or `null` when feedback can be
 * submitted. Pure (default `now`, like `todayInIndia`), so a page can call it directly in render.
 */
export function feedbackDisabledReason(
  event: { status: ScheduleStatus; startsAt: Date },
  now = new Date(),
): string | null {
  if (event.status === "cancelled")
    return "This interview was cancelled. Feedback can't be submitted.";
  if (event.startsAt.getTime() > now.getTime()) {
    return `You can submit feedback once the interview starts, at ${formatIndiaDateTime(event.startsAt)}.`;
  }
  return null;
}
