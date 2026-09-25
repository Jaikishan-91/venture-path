import { getDb } from "./db";
import { getLogger } from "./logger";
import {
  organisationProfileChanged,
  nextOrganisationStatus,
  type OrganisationProfileInput,
  type OrganisationStatus,
  type UserProfileInput,
} from "./profile-schemas";

export function getUserProfile(userId: string) {
  return getDb().userProfile.findUnique({ where: { userId } });
}

export function getOrganisationProfile(userId: string) {
  return getDb().organisationProfile.findUnique({ where: { userId } });
}

export async function saveUserProfile(userId: string, input: UserProfileInput): Promise<void> {
  await getDb().userProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
  getLogger().info({ userId }, "user profile saved");
}

export type SaveOrganisationProfileResult =
  { ok: true; status: OrganisationStatus } | { ok: false; reason: "conflict" };

/** `userId` must come from the session. The status is derived here, never taken from input. */
export async function saveOrganisationProfile(
  userId: string,
  input: OrganisationProfileInput,
): Promise<SaveOrganisationProfileResult> {
  const db = getDb();
  const logger = getLogger();
  const current = await db.organisationProfile.findUnique({ where: { userId } });

  if (!current) {
    await db.organisationProfile.create({ data: { userId, ...input, status: "pending" } });
    logger.info({ userId, status: "pending" }, "Organisation profile created");
    return { ok: true, status: "pending" };
  }

  const status = nextOrganisationStatus(current.status, organisationProfileChanged(current, input));
  // Conditional on the status we read, so a concurrent review decision is never overwritten.
  const { count } = await db.organisationProfile.updateMany({
    where: { userId, status: current.status },
    data: { ...input, status },
  });
  if (count === 0) {
    logger.warn({ userId }, "Organisation profile save conflicted with a status change");
    return { ok: false, reason: "conflict" };
  }

  logger.info({ userId, from: current.status, to: status }, "Organisation profile saved");
  return { ok: true, status };
}
