import "server-only";
import { decideApplicationTx, notifyApplicationDecision } from "./applications";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { getOrderedStages } from "./pipelines";
import { runInBackground } from "./background";
import { cancelFutureEventsForApplication, cancelFutureEventsForStage } from "./scheduling";
import type { ProgressFailure, Result } from "./hiring/types";

/**
 * Moves a candidate through a listing's pipeline (WP4, D5/ADR-037): submitted = implicit
 * "Applied" stage; failing any stage (or a direct reject) rejects the application; passing the
 * last stage accepts it, exactly like `decideApplication`. Every function here is scoped to the
 * organisation that owns the listing (via the application's opportunity) and is conditional on
 * `expectedStageId`, the stage the caller's page showed — a mismatch (someone else changed the
 * candidate's stage meanwhile) fails with `stale` rather than silently overwriting it.
 */

type OwnedApplication = {
  id: string;
  status: string;
  currentStageId: string | null;
  opportunityId: string;
};

/** The application scoped to `orgUserId`'s own listings, or `null` (caller returns `not_found`). */
async function loadOwnedApplication(
  orgUserId: string,
  applicationId: string,
): Promise<OwnedApplication | null> {
  return getDb().application.findFirst({
    where: { id: applicationId, opportunity: { organisationProfile: { userId: orgUserId } } },
    select: { id: true, status: true, currentStageId: true, opportunityId: true },
  });
}

/**
 * Advances a candidate to the next stage (writing `StageEvent(passed)` for the stage they were
 * at, unless they were at "Applied"), or — from the last stage — accepts the application, exactly
 * like `decideApplication`.
 */
export async function advanceCandidate(
  orgUserId: string,
  applicationId: string,
  expectedStageId: string | null,
): Promise<Result<{ stageId: string | null; accepted: boolean }, ProgressFailure>> {
  const application = await loadOwnedApplication(orgUserId, applicationId);
  if (!application) return { ok: false, reason: "not_found" };

  const stages = await getOrderedStages(application.opportunityId);
  if (stages.length === 0) return { ok: false, reason: "invalid" };

  const currentIndex =
    expectedStageId === null ? -1 : stages.findIndex((stage) => stage.id === expectedStageId);
  if (expectedStageId !== null && currentIndex === -1) return { ok: false, reason: "invalid" };
  const isLastStage = currentIndex === stages.length - 1;
  const nextStage = stages[currentIndex + 1];

  const result = await getDb().$transaction(async (tx) => {
    if (isLastStage) {
      const decided = await decideApplicationTx(
        tx,
        { id: applicationId, currentStageId: expectedStageId },
        "accepted",
      );
      if (decided === 0) return { ok: false as const, reason: "stale" as const };
      await tx.stageEvent.create({
        data: {
          applicationId,
          stageId: expectedStageId as string,
          outcome: "passed",
          actorUserId: orgUserId,
        },
      });
      return { ok: true as const, stageId: expectedStageId, accepted: true };
    }

    const { count } = await tx.application.updateMany({
      where: { id: applicationId, status: "submitted", currentStageId: expectedStageId },
      data: { currentStageId: nextStage.id },
    });
    if (count === 0) return { ok: false as const, reason: "stale" as const };
    if (expectedStageId !== null) {
      await tx.stageEvent.create({
        data: {
          applicationId,
          stageId: expectedStageId,
          outcome: "passed",
          actorUserId: orgUserId,
        },
      });
    }
    return { ok: true as const, stageId: nextStage.id, accepted: false };
  });

  if (!result.ok) return result;

  getLogger().info(
    { orgUserId, applicationId, stageId: result.stageId, accepted: result.accepted },
    "candidate advanced",
  );
  if (result.accepted) {
    runInBackground("application decision email", { applicationId }, () =>
      notifyApplicationDecision(applicationId, "accepted"),
    );
    await cancelFutureEventsForApplication(applicationId);
  } else if (expectedStageId !== null) {
    await cancelFutureEventsForStage(applicationId, expectedStageId);
  }
  return result;
}

/**
 * Fails a candidate at their current stage (writing `StageEvent(failed)`, unless they were at
 * "Applied") and rejects the application, exactly like `decideApplication`.
 */
export async function failCandidate(
  orgUserId: string,
  applicationId: string,
  expectedStageId: string | null,
): Promise<Result<object, ProgressFailure>> {
  const application = await loadOwnedApplication(orgUserId, applicationId);
  if (!application) return { ok: false, reason: "not_found" };

  const stages = await getOrderedStages(application.opportunityId);
  if (stages.length === 0) return { ok: false, reason: "invalid" };
  if (expectedStageId !== null && !stages.some((stage) => stage.id === expectedStageId)) {
    return { ok: false, reason: "invalid" };
  }

  const decided = await getDb().$transaction(async (tx) => {
    const count = await decideApplicationTx(
      tx,
      { id: applicationId, currentStageId: expectedStageId },
      "rejected",
    );
    if (count === 0) return 0;
    if (expectedStageId !== null) {
      await tx.stageEvent.create({
        data: {
          applicationId,
          stageId: expectedStageId,
          outcome: "failed",
          actorUserId: orgUserId,
        },
      });
    }
    return count;
  });
  if (decided === 0) return { ok: false, reason: "stale" };

  getLogger().info({ orgUserId, applicationId, expectedStageId }, "candidate failed");
  runInBackground("application decision email", { applicationId }, () =>
    notifyApplicationDecision(applicationId, "rejected"),
  );
  await cancelFutureEventsForApplication(applicationId);
  return { ok: true };
}

/**
 * Moves a candidate to any stage of the same listing, or back to "Applied" (`targetStageId`
 * `null`), without changing their application status. Records `StageEvent(moved)` at the target
 * stage, or at the current stage when moving back to "Applied". Future events of the stage they
 * left are cancelled.
 */
export async function moveCandidate(
  orgUserId: string,
  applicationId: string,
  expectedStageId: string | null,
  targetStageId: string | null,
): Promise<Result<{ stageId: string | null }, ProgressFailure>> {
  const application = await loadOwnedApplication(orgUserId, applicationId);
  if (!application) return { ok: false, reason: "not_found" };

  const stages = await getOrderedStages(application.opportunityId);
  if (stages.length === 0) return { ok: false, reason: "invalid" };
  if (targetStageId !== null && !stages.some((stage) => stage.id === targetStageId)) {
    return { ok: false, reason: "invalid" };
  }

  const count = await getDb().$transaction(async (tx) => {
    const updateResult = await tx.application.updateMany({
      where: { id: applicationId, status: "submitted", currentStageId: expectedStageId },
      data: { currentStageId: targetStageId },
    });
    if (updateResult.count === 0) return 0;
    const eventStageId = targetStageId ?? expectedStageId;
    if (eventStageId) {
      await tx.stageEvent.create({
        data: { applicationId, stageId: eventStageId, outcome: "moved", actorUserId: orgUserId },
      });
    }
    return updateResult.count;
  });
  if (count === 0) return { ok: false, reason: "stale" };

  getLogger().info({ orgUserId, applicationId, targetStageId }, "candidate moved");
  // The candidate is no longer at their old stage, so its upcoming slots no longer apply.
  if (expectedStageId !== null && expectedStageId !== targetStageId) {
    await cancelFutureEventsForStage(applicationId, expectedStageId);
  }
  return { ok: true, stageId: targetStageId };
}
