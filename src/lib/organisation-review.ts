import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import type { ReviewInput } from "./organisation-review-schema";
import type { OrganisationStatus } from "./profile-schemas";

export const ORGANISATION_LIST_LIMIT = 100;

export type ReviewResult =
  { ok: true; status: OrganisationStatus } | { ok: false; reason: "not_found" | "changed" };

/** `adminId` must come from an admin session. */
export async function reviewOrganisation(
  adminId: string,
  input: ReviewInput,
): Promise<ReviewResult> {
  const db = getDb();
  const logger = getLogger();
  const status: OrganisationStatus = input.decision === "approve" ? "approved" : "rejected";
  const rejectionReason = input.decision === "reject" ? input.reason : null;

  const { count } = await db.organisationProfile.updateMany({
    where: {
      id: input.profileId,
      updatedAt: new Date(input.profileUpdatedAt),
      status: { not: status },
    },
    data: { status, reviewedById: adminId, reviewedAt: new Date(), rejectionReason },
  });

  if (count === 0) {
    const exists = await db.organisationProfile.count({ where: { id: input.profileId } });
    logger.warn(
      { adminId, profileId: input.profileId },
      "Organisation review refused: profile changed",
    );
    return { ok: false, reason: exists ? "changed" : "not_found" };
  }

  logger.info({ adminId, profileId: input.profileId, status }, "Organisation reviewed");
  void notifyOrganisation(input.profileId, status, rejectionReason);
  return { ok: true, status };
}

async function notifyOrganisation(
  profileId: string,
  status: OrganisationStatus,
  reason: string | null,
) {
  const logger = getLogger();
  try {
    const profile = await getDb().organisationProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: { businessName: true, user: { select: { email: true } } },
    });
    const baseUrl = getEnv().BETTER_AUTH_URL;
    await sendEmail(
      status === "approved"
        ? {
            to: profile.user.email,
            subject: `${profile.businessName} is approved on VenturePath`,
            text: `Good news: ${profile.businessName} has been approved on VenturePath. Users can now see your published listings.\n\n${baseUrl}/organisation`,
          }
        : {
            to: profile.user.email,
            subject: `${profile.businessName} wasn't approved on VenturePath`,
            text: `${profile.businessName} wasn't approved on VenturePath.\n\nReason: ${reason}\n\nUpdate your profile and save it to submit it for review again:\n${baseUrl}/organisation/profile`,
          },
    );
    logger.info({ profileId, status }, "Organisation review email sent");
  } catch (err) {
    logger.error({ profileId, err }, "Organisation review email failed");
  }
}

export function listOrganisations(status: OrganisationStatus) {
  return getDb().organisationProfile.findMany({
    where: { status },
    include: {
      user: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { updatedAt: status === "pending" ? "asc" : "desc" },
    take: ORGANISATION_LIST_LIMIT,
  });
}

export async function countOrganisationsByStatus(): Promise<Record<OrganisationStatus, number>> {
  const groups = await getDb().organisationProfile.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: Record<OrganisationStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}
