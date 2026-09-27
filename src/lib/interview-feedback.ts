import "server-only";
import type { Recommendation } from "@/generated/prisma/client";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { feedbackSchema } from "./feedback-schemas";
import type { FeedbackFailure, FeedbackInput, Result } from "./hiring/types";

/**
 * Interviewer feedback on a scheduled event (WP5). `submitFeedback` enforces the same D4
 * authorization rule as `hm-interviews.ts` (assigned interviewer + matching active org).
 */

export async function submitFeedback(
  userId: string,
  organisationProfileId: string,
  eventId: string,
  input: FeedbackInput,
  now = new Date(),
): Promise<Result<object, FeedbackFailure>> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const event = await getDb().scheduledEvent.findFirst({
    where: {
      id: eventId,
      interviewers: { some: { userId } },
      application: { opportunity: { organisationProfileId } },
    },
    select: { id: true, status: true, startsAt: true },
  });
  if (!event) return { ok: false, reason: "not_found" };
  if (event.status === "cancelled") return { ok: false, reason: "cancelled" };
  if (event.startsAt.getTime() > now.getTime()) return { ok: false, reason: "not_yet" };

  await getDb().interviewFeedback.upsert({
    where: {
      scheduledEventId_interviewerUserId: { scheduledEventId: eventId, interviewerUserId: userId },
    },
    create: { scheduledEventId: eventId, interviewerUserId: userId, ...parsed.data },
    update: { ...parsed.data },
  });
  getLogger().info({ userId, eventId }, "interview feedback submitted");
  return { ok: true };
}

export type FeedbackView = {
  eventId: string;
  stageName: string;
  startsAt: Date;
  interviewerName: string;
  rating: number;
  recommendation: Recommendation;
  notes: string;
  submittedAt: Date;
  updatedAt: Date;
};

/**
 * All interview feedback for the given applications, scoped to `orgUserId`'s own listings (never
 * another organisation's), grouped by application id. Used by the organisation applicants page.
 */
export async function listFeedbackForApplications(
  orgUserId: string,
  applicationIds: string[],
): Promise<Record<string, FeedbackView[]>> {
  if (applicationIds.length === 0) return {};

  const rows = await getDb().interviewFeedback.findMany({
    where: {
      scheduledEvent: {
        applicationId: { in: applicationIds },
        application: { opportunity: { organisationProfile: { userId: orgUserId } } },
      },
    },
    select: {
      rating: true,
      recommendation: true,
      notes: true,
      submittedAt: true,
      updatedAt: true,
      interviewer: { select: { name: true } },
      scheduledEvent: {
        select: {
          id: true,
          startsAt: true,
          applicationId: true,
          stage: { select: { name: true } },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  const byApplication: Record<string, FeedbackView[]> = {};
  for (const row of rows) {
    const view: FeedbackView = {
      eventId: row.scheduledEvent.id,
      stageName: row.scheduledEvent.stage.name,
      startsAt: row.scheduledEvent.startsAt,
      interviewerName: row.interviewer.name,
      rating: row.rating,
      recommendation: row.recommendation,
      notes: row.notes,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
    };
    (byApplication[row.scheduledEvent.applicationId] ??= []).push(view);
  }
  return byApplication;
}
