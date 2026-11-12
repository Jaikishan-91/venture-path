import "server-only";
import { decideApplication } from "./applications";
import { expireOpenInterviews } from "./ai-interview";
import { runInBackground } from "./background";
import { getDb } from "./db";
import type { ProgressFailure, Result } from "./hiring/types";
import { getLogger } from "./logger";
import { sendOfferEmail } from "./offer-emails";
import {
  OFFER_ACCEPTED_NOTE,
  notSelectedReasonSchema,
  offerAnswerSchema,
  offerSchema,
} from "./offer-schemas";
import { failCandidate } from "./pipeline-progress";
import { getOrderedStages } from "./pipelines";
import { cancelFutureEventsForApplication } from "./scheduling";
import type { OfferFailure } from "./v2/types";

/**
 * The final hiring step (plan 2026-11-12-hiring-and-ai-interview-v2, D2): the owner makes an
 * offer after the last pipeline stage (or from Applied when the listing has no steps), the
 * student accepts (→ Hired) or declines it. Every write is conditional on the state the caller
 * checked, so two clicks or two people never both win. Humans decide; nothing here runs on its own.
 */

/** Statuses an offer can be (re)made from: none yet, declined, or withdrawn. */
const OFFERABLE = {
  OR: [{ offerStatus: null }, { offerStatus: { in: ["declined" as const, "withdrawn" as const] } }],
};

const ownedBy = (ownerUserId: string) => ({
  opportunity: { organisationProfile: { userId: ownerUserId } },
});

export async function makeOffer(
  ownerUserId: string,
  applicationId: string,
  input: unknown,
  now = new Date(),
): Promise<Result<object, OfferFailure>> {
  const db = getDb();
  const application = await db.application.findFirst({
    where: { id: applicationId, ...ownedBy(ownerUserId) },
    select: { status: true, currentStageId: true, offerStatus: true, opportunityId: true },
  });
  if (!application) return { ok: false, reason: "not_found" };

  const parsed = offerSchema(now).safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message };
  }
  if (application.status !== "submitted" || application.offerStatus === "pending") {
    return { ok: false, reason: "wrong_state" };
  }
  const stages = await getOrderedStages(application.opportunityId);
  const lastStageId = stages.at(-1)?.id ?? null;
  if (application.currentStageId !== lastStageId) return { ok: false, reason: "not_ready" };

  const { count } = await db.application.updateMany({
    where: {
      AND: [{ id: applicationId, status: "submitted", currentStageId: lastStageId }, OFFERABLE],
    },
    data: {
      offerStatus: "pending",
      offerMessage: parsed.data.message,
      offerStipendInr: parsed.data.stipendInr ?? null,
      offerStartDate: parsed.data.startDate ? new Date(`${parsed.data.startDate}T00:00:00Z`) : null,
      offeredAt: now,
      offeredById: ownerUserId,
      offerRespondedAt: null,
    },
  });
  if (count === 0) return { ok: false, reason: "stale" };
  getLogger().info({ ownerUserId, applicationId }, "offer made");
  runInBackground("offer email", { applicationId }, () =>
    sendOfferEmail(applicationId, "offer_made"),
  );
  return { ok: true };
}

export async function withdrawOffer(
  ownerUserId: string,
  applicationId: string,
): Promise<Result<object, OfferFailure>> {
  const { count } = await getDb().application.updateMany({
    where: {
      id: applicationId,
      status: "submitted",
      offerStatus: "pending",
      ...ownedBy(ownerUserId),
    },
    data: { offerStatus: "withdrawn" },
  });
  if (count === 0) {
    const exists = await getDb().application.count({
      where: { id: applicationId, ...ownedBy(ownerUserId) },
    });
    return { ok: false, reason: exists ? "wrong_state" : "not_found" };
  }
  getLogger().info({ ownerUserId, applicationId }, "offer withdrawn");
  runInBackground("offer email", { applicationId }, () =>
    sendOfferEmail(applicationId, "offer_withdrawn"),
  );
  return { ok: true };
}

/**
 * The student's answer to a pending offer. Accept → Hired: the application becomes `accepted`
 * (decidedAt set, a `passed` event for the last stage, future events cancelled, open AI
 * interviews expired, emails to both sides). Decline → the offer is `declined` and the candidate
 * stays on the Offer tab for the owner to decide.
 */
export async function respondToOffer(
  studentUserId: string,
  applicationId: string,
  answer: unknown,
  now = new Date(),
): Promise<Result<{ hired: boolean }, OfferFailure>> {
  const parsedAnswer = offerAnswerSchema.safeParse(answer);
  if (!parsedAnswer.success) return { ok: false, reason: "invalid" };
  const db = getDb();
  const mine = { id: applicationId, userProfile: { userId: studentUserId } };
  const application = await db.application.findFirst({
    where: mine,
    select: { currentStageId: true, offeredById: true },
  });
  if (!application) return { ok: false, reason: "not_found" };
  const pending = { ...mine, status: "submitted" as const, offerStatus: "pending" as const };

  if (parsedAnswer.data === "decline") {
    const { count } = await db.application.updateMany({
      where: pending,
      data: { offerStatus: "declined", offerRespondedAt: now },
    });
    if (count === 0) return { ok: false, reason: "wrong_state" };
    getLogger().info({ studentUserId, applicationId }, "offer declined");
    runInBackground("offer email", { applicationId }, () =>
      sendOfferEmail(applicationId, "offer_declined"),
    );
    return { ok: true, hired: false };
  }

  const hired = await db.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: pending,
      data: {
        status: "accepted",
        decidedAt: now,
        offerStatus: "accepted",
        offerRespondedAt: now,
      },
    });
    if (count === 0) return false;
    if (application.currentStageId) {
      await tx.stageEvent.create({
        data: {
          applicationId,
          stageId: application.currentStageId,
          outcome: "passed",
          actorUserId: application.offeredById,
          note: OFFER_ACCEPTED_NOTE,
        },
      });
    }
    return true;
  });
  if (!hired) return { ok: false, reason: "wrong_state" };

  getLogger().info({ studentUserId, applicationId }, "offer accepted");
  runInBackground("offer email", { applicationId }, () =>
    sendOfferEmail(applicationId, "offer_accepted"),
  );
  runInBackground("cancel future events", { applicationId }, () =>
    cancelFutureEventsForApplication(applicationId),
  );
  runInBackground("expire AI interviews", { applicationId }, () =>
    expireOpenInterviews(applicationId),
  );
  return { ok: true, hired: true };
}

export type NotSelectedFailure = ProgressFailure | "wrong_state";

/**
 * "Not selected" from the board or candidate page, with an optional kind reason (sent in the
 * email). Uses the pipeline path when the listing has steps, else the direct decision. Refused
 * while an offer is pending (withdraw it first).
 */
export async function markNotSelected(
  ownerUserId: string,
  applicationId: string,
  expectedStageId: string | null,
  reason: unknown,
): Promise<Result<object, NotSelectedFailure>> {
  const parsedReason = notSelectedReasonSchema.safeParse(reason ?? undefined);
  if (!parsedReason.success) {
    return { ok: false, reason: "invalid", message: parsedReason.error.issues[0]?.message };
  }
  const application = await getDb().application.findFirst({
    where: { id: applicationId, ...ownedBy(ownerUserId) },
    select: { opportunityId: true, offerStatus: true },
  });
  if (!application) return { ok: false, reason: "not_found" };
  if (application.offerStatus === "pending") return { ok: false, reason: "wrong_state" };

  const stages = await getOrderedStages(application.opportunityId);
  if (stages.length > 0) {
    return failCandidate(ownerUserId, applicationId, expectedStageId, parsedReason.data);
  }
  const result = await decideApplication(ownerUserId, applicationId, "rejected", parsedReason.data);
  return result.ok ? { ok: true } : { ok: false, reason: "stale" };
}
