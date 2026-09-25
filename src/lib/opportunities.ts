import { getDb } from "./db";
import { getLogger } from "./logger";
import type { Prisma } from "@/generated/prisma/client";
import {
  isDeadlinePassed,
  type OpportunityInput,
  type OpportunityStatus,
  type QuestionInput,
} from "./opportunity-schemas";
import { refreshOpportunityEmbedding } from "./search";

export type OpportunityFailure =
  "not_approved" | "not_found" | "invalid_state" | "deadline_passed" | "questions_locked";
export type OpportunityResult<T = object> =
  ({ ok: true } & T) | { ok: false; reason: OpportunityFailure };

export type StatusAction = "publish" | "close" | "reopen";

const TRANSITIONS: Record<
  StatusAction,
  { from: OpportunityStatus; to: OpportunityStatus; needsApproval: boolean }
> = {
  publish: { from: "draft", to: "published", needsApproval: true },
  close: { from: "published", to: "closed", needsApproval: false },
  reopen: { from: "closed", to: "published", needsApproval: true },
};

class QuestionsLocked extends Error {}

/** Scopes a query to listings owned by the organisation user `userId` (from the session). */
const ownedBy = (userId: string) => ({ organisationProfile: { userId } });

/** A failed embedding never fails the save; `npm run embeddings:backfill` fills gaps. */
async function tryRefreshEmbedding(userId: string, opportunityId: string) {
  try {
    await refreshOpportunityEmbedding(opportunityId);
  } catch (err) {
    getLogger().error({ userId, opportunityId, err }, "opportunity embedding failed");
  }
}

function getProfile(userId: string) {
  return getDb().organisationProfile.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
}

export function listOwnOpportunities(userId: string) {
  return getDb().opportunity.findMany({
    where: ownedBy(userId),
    orderBy: { updatedAt: "desc" },
  });
}

export function getOwnOpportunity(userId: string, id: string) {
  return getDb().opportunity.findFirst({
    where: { id, ...ownedBy(userId) },
    include: {
      questions: { orderBy: { position: "asc" } },
      _count: { select: { applications: true } },
    },
  });
}

/** Screening questions of a listing, in order. */
export function listQuestions(opportunityId: string) {
  return getDb().opportunityQuestion.findMany({
    where: { opportunityId },
    orderBy: { position: "asc" },
    select: { id: true, prompt: true },
  });
}

/**
 * Replace a listing's questions (ADR-032). Once anyone has applied (any status) the questions
 * are locked: an identical list is accepted, anything else is refused. A question keeps the
 * `ai` source only while its text is unchanged from a stored AI draft.
 */
async function replaceQuestions(
  tx: Prisma.TransactionClient,
  opportunityId: string,
  questions: QuestionInput[],
): Promise<"ok" | "questions_locked"> {
  const [existing, applications] = await Promise.all([
    tx.opportunityQuestion.findMany({
      where: { opportunityId },
      orderBy: { position: "asc" },
      select: { prompt: true, source: true },
    }),
    tx.application.count({ where: { opportunityId } }),
  ]);
  const unchanged =
    existing.length === questions.length &&
    existing.every((question, index) => question.prompt === questions[index].prompt);
  if (unchanged) return "ok";
  if (applications > 0) return "questions_locked";

  const aiDrafts = new Set(existing.filter((q) => q.source === "ai").map((q) => q.prompt));
  await tx.opportunityQuestion.deleteMany({ where: { opportunityId } });
  if (questions.length > 0) {
    await tx.opportunityQuestion.createMany({
      data: questions.map((question, position) => ({
        opportunityId,
        position,
        prompt: question.prompt,
        source: aiDrafts.has(question.prompt) ? ("ai" as const) : question.source,
      })),
    });
  }
  return "ok";
}

export async function createOpportunity(
  userId: string,
  input: OpportunityInput,
  questions: QuestionInput[] = [],
): Promise<OpportunityResult<{ id: string }>> {
  const profile = await getProfile(userId);
  if (profile?.status !== "approved") return { ok: false, reason: "not_approved" };

  const { id } = await getDb().opportunity.create({
    data: {
      ...input,
      organisationProfileId: profile.id,
      questions: {
        create: questions.map((question, position) => ({ ...question, position })),
      },
    },
    select: { id: true },
  });
  getLogger().info({ userId, opportunityId: id }, "opportunity created");
  await tryRefreshEmbedding(userId, id);
  return { ok: true, id };
}

/** `questions` undefined leaves the listing's questions untouched. */
export async function updateOpportunity(
  userId: string,
  id: string,
  input: OpportunityInput,
  questions?: QuestionInput[],
): Promise<OpportunityResult> {
  const profile = await getProfile(userId);
  if (profile?.status !== "approved") return { ok: false, reason: "not_approved" };

  const outcome = await getDb()
    .$transaction(async (tx) => {
      const { count } = await tx.opportunity.updateMany({
        where: { id, organisationProfileId: profile.id },
        data: input,
      });
      if (count === 0) return "not_found" as const;
      if (questions && (await replaceQuestions(tx, id, questions)) === "questions_locked") {
        // Throwing rolls back the listing update too, so a refused save changes nothing.
        throw new QuestionsLocked();
      }
      return "ok" as const;
    })
    .catch((err: unknown) => {
      if (err instanceof QuestionsLocked) return "questions_locked" as const;
      throw err;
    });
  if (outcome !== "ok") return { ok: false, reason: outcome };
  getLogger().info({ userId, opportunityId: id }, "opportunity updated");
  await tryRefreshEmbedding(userId, id);
  return { ok: true };
}

export async function changeOpportunityStatus(
  userId: string,
  id: string,
  action: StatusAction,
): Promise<OpportunityResult<{ status: OpportunityStatus }>> {
  const { from, to, needsApproval } = TRANSITIONS[action];
  const profile = await getProfile(userId);
  if (!profile) return { ok: false, reason: "not_found" };
  if (needsApproval && profile.status !== "approved") return { ok: false, reason: "not_approved" };

  const current = await getDb().opportunity.findFirst({
    where: { id, organisationProfileId: profile.id },
    select: { status: true, deadline: true },
  });
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status !== from) return { ok: false, reason: "invalid_state" };
  if (to === "published" && isDeadlinePassed(current.deadline)) {
    return { ok: false, reason: "deadline_passed" };
  }

  const now = new Date();
  const { count } = await getDb().opportunity.updateMany({
    where: { id, organisationProfileId: profile.id, status: from },
    data:
      action === "publish"
        ? { status: to, publishedAt: now }
        : action === "close"
          ? { status: to, closedAt: now }
          : { status: to, closedAt: null },
  });
  if (count === 0) return { ok: false, reason: "invalid_state" };

  getLogger().info({ userId, opportunityId: id, from, to }, "opportunity status changed");
  return { ok: true, status: to };
}

export async function deleteDraftOpportunity(
  userId: string,
  id: string,
): Promise<OpportunityResult> {
  const { count } = await getDb().opportunity.deleteMany({
    where: { id, status: "draft", ...ownedBy(userId) },
  });
  if (count === 0) {
    const exists = await getOwnOpportunity(userId, id);
    return { ok: false, reason: exists ? "invalid_state" : "not_found" };
  }
  getLogger().info({ userId, opportunityId: id }, "draft opportunity deleted");
  return { ok: true };
}
