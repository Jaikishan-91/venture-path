import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import type { ReviewInput } from "./msme-review-schema";
import type { MsmeStatus } from "./profile-schemas";

export const MSME_LIST_LIMIT = 100;

export type ReviewResult =
  { ok: true; status: MsmeStatus } | { ok: false; reason: "not_found" | "changed" };

/** `adminId` must come from an admin session. */
export async function reviewMsme(adminId: string, input: ReviewInput): Promise<ReviewResult> {
  const db = getDb();
  const logger = getLogger();
  const status: MsmeStatus = input.decision === "approve" ? "approved" : "rejected";
  const rejectionReason = input.decision === "reject" ? input.reason : null;

  const { count } = await db.msmeProfile.updateMany({
    where: {
      id: input.profileId,
      updatedAt: new Date(input.profileUpdatedAt),
      status: { not: status },
    },
    data: { status, reviewedById: adminId, reviewedAt: new Date(), rejectionReason },
  });

  if (count === 0) {
    const exists = await db.msmeProfile.count({ where: { id: input.profileId } });
    logger.warn({ adminId, profileId: input.profileId }, "msme review refused: profile changed");
    return { ok: false, reason: exists ? "changed" : "not_found" };
  }

  logger.info({ adminId, profileId: input.profileId, status }, "msme reviewed");
  void notifyMsme(input.profileId, status, rejectionReason);
  return { ok: true, status };
}

async function notifyMsme(profileId: string, status: MsmeStatus, reason: string | null) {
  const logger = getLogger();
  try {
    const profile = await getDb().msmeProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: { businessName: true, user: { select: { email: true } } },
    });
    const baseUrl = getEnv().BETTER_AUTH_URL;
    await sendEmail(
      status === "approved"
        ? {
            to: profile.user.email,
            subject: `${profile.businessName} is approved on VenturePath`,
            text: `Good news: ${profile.businessName} has been approved on VenturePath. Students can now see your published listings.\n\n${baseUrl}/msme`,
          }
        : {
            to: profile.user.email,
            subject: `${profile.businessName} wasn't approved on VenturePath`,
            text: `${profile.businessName} wasn't approved on VenturePath.\n\nReason: ${reason}\n\nUpdate your profile and save it to submit it for review again:\n${baseUrl}/msme/profile`,
          },
    );
    logger.info({ profileId, status }, "msme review email sent");
  } catch (err) {
    logger.error({ profileId, err }, "msme review email failed");
  }
}

export function listMsmes(status: MsmeStatus) {
  return getDb().msmeProfile.findMany({
    where: { status },
    include: {
      user: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { updatedAt: status === "pending" ? "asc" : "desc" },
    take: MSME_LIST_LIMIT,
  });
}

export async function countMsmesByStatus(): Promise<Record<MsmeStatus, number>> {
  const groups = await getDb().msmeProfile.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<MsmeStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}
