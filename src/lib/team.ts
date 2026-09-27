import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { runInBackground } from "./background";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { inviteMemberSchema, type InviteMemberInput } from "./team-schemas";
import {
  INVITE_TTL_DAYS,
  MAX_PENDING_INVITES,
  type AcceptInviteFailure,
  type InterviewerOption,
  type InviteFailure,
  type MemberView,
  type Result,
} from "./hiring/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function newExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * MS_PER_DAY);
}

/** Marker to abort a transaction when the invite was accepted or revoked concurrently. */
class InviteRaced extends Error {}

/**
 * Invite (or re-invite) a hiring manager by email, scoped to the caller's own organisation
 * (ADR-036). Never reveals whether an account already exists for the email.
 */
export async function inviteMember(
  orgUserId: string,
  input: InviteMemberInput,
): Promise<Result<{ memberId: string }, InviteFailure>> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { name, email } = parsed.data;

  const db = getDb();
  const org = await db.organisationProfile.findUnique({
    where: { userId: orgUserId },
    select: { id: true, user: { select: { email: true } } },
  });
  if (!org) return { ok: false, reason: "not_found" };
  if (email === org.user.email.toLowerCase()) return { ok: false, reason: "own_email" };

  const existing = await db.organisationMember.findUnique({
    where: { organisationProfileId_email: { organisationProfileId: org.id, email } },
  });
  if (existing?.status === "active") return { ok: false, reason: "already_member" };

  const now = new Date();
  const token = newToken();
  const inviteTokenHash = hashToken(token);
  const inviteExpiresAt = newExpiry(now);

  let memberId: string;
  if (existing?.status === "invited") {
    // Reissue the token in place, same as `resendInvite` (no new pending row, no cap check).
    await db.organisationMember.update({
      where: { id: existing.id },
      data: { inviteTokenHash, inviteExpiresAt, invitedAt: now },
    });
    memberId = existing.id;
  } else {
    // A brand-new row or one coming back from `deactivated` both add a pending invite.
    const pending = await db.organisationMember.count({
      where: { organisationProfileId: org.id, status: "invited", inviteExpiresAt: { gt: now } },
    });
    if (pending >= MAX_PENDING_INVITES) return { ok: false, reason: "too_many_pending" };

    if (existing?.status === "deactivated") {
      await db.organisationMember.update({
        where: { id: existing.id },
        data: {
          name,
          status: "invited",
          inviteTokenHash,
          inviteExpiresAt,
          invitedAt: now,
          deactivatedAt: null,
          userId: null,
        },
      });
      memberId = existing.id;
    } else {
      const created = await db.organisationMember.create({
        data: {
          organisationProfileId: org.id,
          email,
          name,
          status: "invited",
          inviteTokenHash,
          inviteExpiresAt,
          invitedAt: now,
        },
        select: { id: true },
      });
      memberId = created.id;
    }
  }

  getLogger().info({ orgUserId, memberId, reissued: Boolean(existing) }, "hiring manager invited");
  runInBackground("invite email", { memberId }, () => sendInviteEmail(memberId, token));
  return { ok: true, memberId };
}

async function sendInviteEmail(memberId: string, token: string): Promise<void> {
  const member = await getDb().organisationMember.findUniqueOrThrow({
    where: { id: memberId },
    select: {
      email: true,
      name: true,
      organisationProfile: { select: { businessName: true } },
    },
  });
  const url = `${getEnv().BETTER_AUTH_URL}/invite/${token}`;
  await sendEmail({
    to: member.email,
    subject: `You're invited to join ${member.organisationProfile.businessName} on VenturePath`,
    text: `Hi ${member.name},\n\n${member.organisationProfile.businessName} invited you to join VenturePath as a hiring manager.\n\nAccept your invite (expires in ${INVITE_TTL_DAYS} days):\n${url}\n\nIf you weren't expecting this, you can ignore this email.`,
  });
  getLogger().info({ memberId }, "invite email sent");
}

/** Re-sends a pending invite with a fresh token and expiry. Org-scoped. */
export async function resendInvite(
  orgUserId: string,
  memberId: string,
): Promise<Result<object, "not_found" | "invalid">> {
  const db = getDb();
  const member = await db.organisationMember.findFirst({
    where: { id: memberId, organisationProfile: { userId: orgUserId } },
    select: { id: true, status: true },
  });
  if (!member) return { ok: false, reason: "not_found" };
  if (member.status !== "invited") return { ok: false, reason: "invalid" };

  const now = new Date();
  const token = newToken();
  const { count } = await db.organisationMember.updateMany({
    where: { id: memberId, status: "invited" },
    data: { inviteTokenHash: hashToken(token), inviteExpiresAt: newExpiry(now), invitedAt: now },
  });
  if (count === 0) return { ok: false, reason: "invalid" };

  getLogger().info({ orgUserId, memberId }, "invite resent");
  runInBackground("invite email", { memberId }, () => sendInviteEmail(memberId, token));
  return { ok: true };
}

/** Deletes a pending invite outright. Org-scoped. */
export async function revokeInvite(
  orgUserId: string,
  memberId: string,
): Promise<Result<object, "not_found" | "invalid">> {
  const db = getDb();
  const member = await db.organisationMember.findFirst({
    where: { id: memberId, organisationProfile: { userId: orgUserId } },
    select: { id: true, status: true },
  });
  if (!member) return { ok: false, reason: "not_found" };
  if (member.status !== "invited") return { ok: false, reason: "invalid" };

  const { count } = await db.organisationMember.deleteMany({
    where: { id: memberId, status: "invited" },
  });
  if (count === 0) return { ok: false, reason: "invalid" };
  getLogger().info({ orgUserId, memberId }, "invite revoked");
  return { ok: true };
}

/** Deactivates an active member, revoking access immediately. Org-scoped. */
export async function deactivateMember(
  orgUserId: string,
  memberId: string,
): Promise<Result<object, "not_found" | "invalid">> {
  const db = getDb();
  const member = await db.organisationMember.findFirst({
    where: { id: memberId, organisationProfile: { userId: orgUserId } },
    select: { id: true, status: true },
  });
  if (!member) return { ok: false, reason: "not_found" };
  if (member.status !== "active") return { ok: false, reason: "invalid" };

  const { count } = await db.organisationMember.updateMany({
    where: { id: memberId, status: "active" },
    data: { status: "deactivated", deactivatedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: "invalid" };
  getLogger().info({ orgUserId, memberId }, "hiring manager deactivated");
  return { ok: true };
}

/** All members of the caller's organisation, newest invite first. */
export async function listMembers(orgUserId: string): Promise<MemberView[]> {
  const db = getDb();
  const org = await db.organisationProfile.findUnique({
    where: { userId: orgUserId },
    select: { id: true },
  });
  if (!org) return [];

  const rows = await db.organisationMember.findMany({
    where: { organisationProfileId: org.id },
    orderBy: { invitedAt: "desc" },
  });
  const now = new Date();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    expired: row.status === "invited" && Boolean(row.inviteExpiresAt && row.inviteExpiresAt < now),
    invitedAt: row.invitedAt,
    acceptedAt: row.acceptedAt,
  }));
}

/** The owner plus active hiring managers, for interviewer pickers (WP4). */
export async function listInterviewerOptions(orgUserId: string): Promise<InterviewerOption[]> {
  const org = await getDb().organisationProfile.findUnique({
    where: { userId: orgUserId },
    select: {
      user: { select: { id: true, name: true } },
      members: {
        where: { status: "active", userId: { not: null } },
        select: { userId: true, name: true, user: { select: { name: true } } },
      },
    },
  });
  if (!org) return [];

  const owner: InterviewerOption = { userId: org.user.id, name: org.user.name, kind: "owner" };
  const members: InterviewerOption[] = org.members.map((member) => ({
    // Filtered on `userId: { not: null }` above.
    userId: member.userId as string,
    name: member.user?.name ?? member.name,
    kind: "hiring_manager",
  }));
  return [owner, ...members];
}

/** Looks up a pending invite by its raw token. Never returns org details for an invalid token. */
export async function getInvite(
  token: string,
): Promise<
  | { status: "valid"; organisationName: string; name: string; email: string }
  | { status: "invalid" | "expired" }
> {
  const member = await getDb().organisationMember.findUnique({
    where: { inviteTokenHash: hashToken(token) },
    select: {
      status: true,
      name: true,
      email: true,
      inviteExpiresAt: true,
      organisationProfile: { select: { businessName: true } },
    },
  });
  if (!member || member.status !== "invited") return { status: "invalid" };
  if (!member.inviteExpiresAt || member.inviteExpiresAt < new Date()) return { status: "expired" };
  return {
    status: "valid",
    organisationName: member.organisationProfile.businessName,
    name: member.name,
    email: member.email,
  };
}

/**
 * Accepts a pending invite for the signed-in account (single use, ADR-036). Runs as one
 * transaction so a concurrent accept of the same token can only succeed once.
 */
export async function acceptInvite(
  token: string,
  userId: string,
): Promise<Result<{ organisationProfileId: string }, AcceptInviteFailure>> {
  const db = getDb();
  const inviteTokenHash = hashToken(token);

  const member = await db.organisationMember.findUnique({
    where: { inviteTokenHash },
    select: {
      id: true,
      status: true,
      email: true,
      inviteExpiresAt: true,
      organisationProfileId: true,
    },
  });
  if (!member || member.status !== "invited") return { ok: false, reason: "invalid" };
  if (!member.inviteExpiresAt || member.inviteExpiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (user.email.toLowerCase() !== member.email.toLowerCase()) {
    return { ok: false, reason: "email_mismatch" };
  }
  if (user.role !== null && user.role !== "hiring_manager") {
    return { ok: false, reason: "other_role" };
  }

  // An account is a member of at most one organisation (`userId` is unique on the table).
  const otherMembership = await db.organisationMember.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (otherMembership && otherMembership.status === "active") {
    return { ok: false, reason: "member_elsewhere" };
  }

  try {
    await db.$transaction(async (tx) => {
      if (otherMembership) {
        // Free the unique `userId` slot held by the deactivated row before reusing it here.
        await tx.organisationMember.update({
          where: { id: otherMembership.id },
          data: { userId: null },
        });
      }

      // Conditional on the role read above, so a role assigned meanwhile is never overwritten.
      const roleSet = await tx.user.updateMany({
        where: { id: userId, OR: [{ role: null }, { role: "hiring_manager" }] },
        data: { role: "hiring_manager" },
      });
      if (roleSet.count === 0) throw new InviteRaced();

      const { count } = await tx.organisationMember.updateMany({
        where: { id: member.id, inviteTokenHash },
        data: {
          userId,
          status: "active",
          acceptedAt: new Date(),
          inviteTokenHash: null,
          inviteExpiresAt: null,
        },
      });
      if (count === 0) throw new InviteRaced();
    });
  } catch (err) {
    if (err instanceof InviteRaced) return { ok: false, reason: "invalid" };
    throw err;
  }

  getLogger().info({ userId, memberId: member.id }, "invite accepted");
  return { ok: true, organisationProfileId: member.organisationProfileId };
}

/** The account's current active membership, if any (used by `requireActiveHiringManager`). */
export async function getActiveMembership(
  userId: string,
): Promise<{ memberId: string; organisationProfileId: string; organisationName: string } | null> {
  const member = await getDb().organisationMember.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      organisationProfileId: true,
      organisationProfile: { select: { businessName: true } },
    },
  });
  if (!member || member.status !== "active") return null;
  return {
    memberId: member.id,
    organisationProfileId: member.organisationProfileId,
    organisationName: member.organisationProfile.businessName,
  };
}
