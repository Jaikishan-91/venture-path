import "server-only";
import type { StageKind } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { indiaLocalToUtc } from "@/lib/hiring/time";
import { todayInIndia } from "@/lib/opportunity-schemas";

const UPCOMING_TAKE = 5;
const AWAITING_FEEDBACK_TAKE = 5;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type HiringManagerDashboardEvent = {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  stageName: string;
  stageKind: StageKind;
  listingTitle: string;
  candidateName: string;
  meetUrl: string | null;
};

export type HiringManagerDashboard = {
  counts: {
    today: number;
    upcomingWeek: number;
    awaitingFeedback: number;
    feedbackSubmitted: number;
  };
  nextEvents: HiringManagerDashboardEvent[];
  awaitingFeedbackEvents: HiringManagerDashboardEvent[];
};

const EVENT_SELECT = {
  id: true,
  startsAt: true,
  durationMinutes: true,
  meetUrl: true,
  stage: { select: { name: true, kind: true } },
  application: {
    select: {
      opportunity: { select: { title: true } },
      userProfile: { select: { user: { select: { name: true } } } },
    },
  },
} as const;

type EventRow = {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  meetUrl: string | null;
  stage: { name: string; kind: StageKind };
  application: { opportunity: { title: string }; userProfile: { user: { name: string } } };
};

function toEvent(row: EventRow): HiringManagerDashboardEvent {
  return {
    id: row.id,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    stageName: row.stage.name,
    stageKind: row.stage.kind,
    listingTitle: row.application.opportunity.title,
    candidateName: row.application.userProfile.user.name,
    meetUrl: row.meetUrl,
  };
}

/** [today's India midnight, tomorrow's India midnight) as real UTC instants. */
function indiaTodayBounds(now: Date): { from: Date; to: Date } {
  const from = indiaLocalToUtc(`${todayInIndia(now)}T00:00`) ?? now;
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

/**
 * All data for the hiring manager dashboard, scoped to events assigned to `userId` within the
 * caller's active organisation (D4, `hm-interviews.ts`). One `Promise.all` of independent,
 * org-scoped queries.
 */
export async function getHiringManagerDashboard(
  userId: string,
  organisationProfileId: string,
  now = new Date(),
): Promise<HiringManagerDashboard> {
  const db = getDb();
  const assignedTo = {
    interviewers: { some: { userId } },
    application: { opportunity: { organisationProfileId } },
  };
  const { from: todayFrom, to: todayTo } = indiaTodayBounds(now);
  const weekTo = new Date(now.getTime() + SEVEN_DAYS_MS);
  const awaitingFeedbackWhere = {
    ...assignedTo,
    status: { not: "cancelled" as const },
    startsAt: { lt: now },
    feedback: { none: { interviewerUserId: userId } },
  };

  const [
    todayCount,
    upcomingWeekCount,
    feedbackSubmittedCount,
    awaitingFeedbackCount,
    nextRows,
    awaitingRows,
  ] = await Promise.all([
    db.scheduledEvent.count({
      where: {
        ...assignedTo,
        status: { not: "cancelled" },
        startsAt: { gte: todayFrom, lt: todayTo },
      },
    }),
    db.scheduledEvent.count({
      where: { ...assignedTo, status: { not: "cancelled" }, startsAt: { gte: now, lt: weekTo } },
    }),
    db.interviewFeedback.count({
      where: {
        interviewerUserId: userId,
        scheduledEvent: { application: { opportunity: { organisationProfileId } } },
      },
    }),
    db.scheduledEvent.count({ where: awaitingFeedbackWhere }),
    db.scheduledEvent.findMany({
      where: { ...assignedTo, status: { not: "cancelled" }, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: UPCOMING_TAKE,
      select: EVENT_SELECT,
    }),
    db.scheduledEvent.findMany({
      where: awaitingFeedbackWhere,
      orderBy: { startsAt: "desc" },
      take: AWAITING_FEEDBACK_TAKE,
      select: EVENT_SELECT,
    }),
  ]);

  return {
    counts: {
      today: todayCount,
      upcomingWeek: upcomingWeekCount,
      awaitingFeedback: awaitingFeedbackCount,
      feedbackSubmitted: feedbackSubmittedCount,
    },
    nextEvents: nextRows.map(toEvent),
    awaitingFeedbackEvents: awaitingRows.map(toEvent),
  };
}
