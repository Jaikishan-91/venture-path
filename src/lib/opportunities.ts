import { getDb } from "./db";
import { getLogger } from "./logger";
import {
  isDeadlinePassed,
  type OpportunityInput,
  type OpportunityStatus,
} from "./opportunity-schemas";
import { refreshOpportunityEmbedding } from "./search";

export type OpportunityFailure = "not_approved" | "not_found" | "invalid_state" | "deadline_passed";
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

/** Scopes a query to listings owned by the MSME user `userId` (from the session). */
const ownedBy = (userId: string) => ({ msmeProfile: { userId } });

/** A failed embedding never fails the save; `npm run embeddings:backfill` fills gaps. */
async function tryRefreshEmbedding(userId: string, opportunityId: string) {
  try {
    await refreshOpportunityEmbedding(opportunityId);
  } catch (err) {
    getLogger().error({ userId, opportunityId, err }, "opportunity embedding failed");
  }
}

function getProfile(userId: string) {
  return getDb().msmeProfile.findUnique({ where: { userId }, select: { id: true, status: true } });
}

export function listOwnOpportunities(userId: string) {
  return getDb().opportunity.findMany({
    where: ownedBy(userId),
    orderBy: { updatedAt: "desc" },
  });
}

export function getOwnOpportunity(userId: string, id: string) {
  return getDb().opportunity.findFirst({ where: { id, ...ownedBy(userId) } });
}

export async function createOpportunity(
  userId: string,
  input: OpportunityInput,
): Promise<OpportunityResult<{ id: string }>> {
  const profile = await getProfile(userId);
  if (profile?.status !== "approved") return { ok: false, reason: "not_approved" };

  const { id } = await getDb().opportunity.create({
    data: { ...input, msmeProfileId: profile.id },
    select: { id: true },
  });
  getLogger().info({ userId, opportunityId: id }, "opportunity created");
  await tryRefreshEmbedding(userId, id);
  return { ok: true, id };
}

export async function updateOpportunity(
  userId: string,
  id: string,
  input: OpportunityInput,
): Promise<OpportunityResult> {
  const profile = await getProfile(userId);
  if (profile?.status !== "approved") return { ok: false, reason: "not_approved" };

  const { count } = await getDb().opportunity.updateMany({
    where: { id, msmeProfileId: profile.id },
    data: input,
  });
  if (count === 0) return { ok: false, reason: "not_found" };
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
    where: { id, msmeProfileId: profile.id },
    select: { status: true, deadline: true },
  });
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status !== from) return { ok: false, reason: "invalid_state" };
  if (to === "published" && isDeadlinePassed(current.deadline)) {
    return { ok: false, reason: "deadline_passed" };
  }

  const now = new Date();
  const { count } = await getDb().opportunity.updateMany({
    where: { id, msmeProfileId: profile.id, status: from },
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
