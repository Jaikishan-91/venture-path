import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import { MAX_PENDING_INVITES } from "@/lib/hiring/types";
import {
  acceptInvite,
  deactivateMember,
  getActiveMembership,
  getInvite,
  inviteMember,
  listInterviewerOptions,
  listMembers,
  resendInvite,
  revokeInvite,
} from "@/lib/team";
import { assignInitialRole } from "@/lib/user-roles";

const EMAIL_DOMAIN = "team-test.venturepath.local";

const sendEmailSpy = vi.spyOn(emailLib, "sendEmail").mockResolvedValue(undefined);

beforeEach(() => {
  sendEmailSpy.mockClear();
});

function uniqueEmail(prefix = "invitee") {
  return `${prefix}-${randomUUID()}@${EMAIL_DOMAIN}`;
}

async function createOrgOwner() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Org Owner",
      email: uniqueEmail("owner"),
      role: "organisation",
      organisationProfile: {
        create: {
          businessName: "Acme",
          description: "Tools",
          industry: "Manufacturing",
          location: "Pune",
        },
      },
    },
  });
}

async function createAccount(
  role: "user" | "organisation" | "hiring_manager" | null,
  email?: string,
) {
  return getDb().user.create({
    data: { id: randomUUID(), name: "Test Account", email: email ?? uniqueEmail("account"), role },
  });
}

/** The raw invite token from the most recently sent invite email. */
async function lastInviteToken(): Promise<string> {
  await settleBackground();
  const call = sendEmailSpy.mock.calls.at(-1);
  if (!call) throw new Error("sendEmail was not called");
  const match = call[0].text.match(/\/invite\/(\S+)/);
  if (!match) throw new Error(`No invite link found in email text: ${call[0].text}`);
  return match[1];
}

function unwrap<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got failure: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("inviteMember", () => {
  it("stores only the token hash, never the raw token", async () => {
    const owner = await createOrgOwner();
    const { memberId } = unwrap(
      await inviteMember(owner.id, { name: "Priya", email: uniqueEmail() }),
    );
    const token = await lastInviteToken();

    const row = await getDb().organisationMember.findUniqueOrThrow({ where: { id: memberId } });
    expect(row.inviteTokenHash).not.toBe(token);
    expect(row.inviteTokenHash).toHaveLength(64);
    expect(await getInvite(token)).toMatchObject({ status: "valid", organisationName: "Acme" });
  });

  it("refuses an invite to the owner's own email", async () => {
    const owner = await createOrgOwner();
    expect(await inviteMember(owner.id, { name: "Me", email: owner.email })).toEqual({
      ok: false,
      reason: "own_email",
    });
  });

  it("reports not_found when the caller has no organisation profile", async () => {
    const account = await createAccount("organisation");
    expect(await inviteMember(account.id, { name: "X", email: uniqueEmail() })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("refuses more than MAX_PENDING_INVITES non-expired pending invites", async () => {
    const owner = await createOrgOwner();
    for (let i = 0; i < MAX_PENDING_INVITES; i++) {
      expect(
        await inviteMember(owner.id, { name: `Person ${i}`, email: uniqueEmail() }),
      ).toMatchObject({ ok: true });
    }
    expect(await inviteMember(owner.id, { name: "One too many", email: uniqueEmail() })).toEqual({
      ok: false,
      reason: "too_many_pending",
    });
    await settleBackground();
  });

  it("already_member when the email is an active member, reissues when invited or deactivated", async () => {
    const owner = await createOrgOwner();
    const email = uniqueEmail();
    const invited = unwrap(await inviteMember(owner.id, { name: "Ravi", email }));
    const tokenA = await lastInviteToken();

    // Still `invited`: re-inviting reissues the token in place (no new row, no cap hit).
    const reissued = unwrap(await inviteMember(owner.id, { name: "Ravi", email }));
    expect(reissued.memberId).toBe(invited.memberId);
    const tokenB = await lastInviteToken();
    expect(tokenB).not.toBe(tokenA);
    expect(await getInvite(tokenA)).toEqual({ status: "invalid" });
    expect(await getInvite(tokenB)).toMatchObject({ status: "valid" });

    const account = await createAccount(null, email);
    unwrap(await acceptInvite(tokenB, account.id));

    expect(await inviteMember(owner.id, { name: "Ravi", email })).toEqual({
      ok: false,
      reason: "already_member",
    });

    unwrap(await deactivateMember(owner.id, invited.memberId));
    const reInvited = unwrap(await inviteMember(owner.id, { name: "Ravi again", email }));
    expect(reInvited.memberId).toBe(invited.memberId);
    const row = await getDb().organisationMember.findUniqueOrThrow({
      where: { id: invited.memberId },
    });
    expect(row.status).toBe("invited");
    expect(row.userId).toBeNull();
  });
});

describe("getInvite", () => {
  it("treats an unknown token as invalid", async () => {
    expect(await getInvite("does-not-exist")).toEqual({ status: "invalid" });
  });

  it("reports an expired invite without leaking organisation details", async () => {
    const owner = await createOrgOwner();
    const { memberId } = unwrap(
      await inviteMember(owner.id, { name: "Late", email: uniqueEmail() }),
    );
    const token = await lastInviteToken();

    await getDb().organisationMember.update({
      where: { id: memberId },
      data: { inviteExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getInvite(token)).toEqual({ status: "expired" });
  });
});

describe("acceptInvite", () => {
  it("accepts happy path: sets the role, activates, and clears the token", async () => {
    const owner = await createOrgOwner();
    const email = uniqueEmail();
    const { memberId } = unwrap(await inviteMember(owner.id, { name: "New HM", email }));
    const token = await lastInviteToken();
    const account = await createAccount(null, email);

    const result = unwrap(await acceptInvite(token, account.id));
    expect(result.organisationProfileId).toBeTruthy();

    const user = await getDb().user.findUniqueOrThrow({ where: { id: account.id } });
    expect(user.role).toBe("hiring_manager");

    const row = await getDb().organisationMember.findUniqueOrThrow({ where: { id: memberId } });
    expect(row.status).toBe("active");
    expect(row.userId).toBe(account.id);
    expect(row.inviteTokenHash).toBeNull();
    expect(row.inviteExpiresAt).toBeNull();
    expect(row.acceptedAt).not.toBeNull();

    const membership = await getActiveMembership(account.id);
    expect(membership).toMatchObject({ memberId, organisationName: "Acme" });
  });

  it("a second accept of the same token is refused (single use)", async () => {
    const owner = await createOrgOwner();
    const email = uniqueEmail();
    unwrap(await inviteMember(owner.id, { name: "Once", email }));
    const token = await lastInviteToken();
    const account = await createAccount(null, email);

    unwrap(await acceptInvite(token, account.id));
    expect(await acceptInvite(token, account.id)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses when the account's email doesn't match the invite", async () => {
    const owner = await createOrgOwner();
    unwrap(await inviteMember(owner.id, { name: "Mismatch", email: uniqueEmail() }));
    const token = await lastInviteToken();
    const account = await createAccount(null, uniqueEmail("someone-else"));

    expect(await acceptInvite(token, account.id)).toEqual({ ok: false, reason: "email_mismatch" });
  });

  it("refuses an account that already has another role", async () => {
    const owner = await createOrgOwner();
    const email = uniqueEmail();
    unwrap(await inviteMember(owner.id, { name: "Taken", email }));
    const token = await lastInviteToken();
    const account = await createAccount("user", email);

    expect(await acceptInvite(token, account.id)).toEqual({ ok: false, reason: "other_role" });
  });

  it("refuses an account that is already an active member of another organisation", async () => {
    const ownerA = await createOrgOwner();
    const ownerB = await createOrgOwner();
    const email = uniqueEmail();

    unwrap(await inviteMember(ownerA.id, { name: "Busy", email }));
    const tokenA = await lastInviteToken();
    const account = await createAccount(null, email);
    unwrap(await acceptInvite(tokenA, account.id));

    unwrap(await inviteMember(ownerB.id, { name: "Busy", email }));
    const tokenB = await lastInviteToken();
    expect(await acceptInvite(tokenB, account.id)).toEqual({
      ok: false,
      reason: "member_elsewhere",
    });
  });

  it("lets a deactivated member accept a fresh invite from the same organisation again", async () => {
    const owner = await createOrgOwner();
    const email = uniqueEmail();
    const { memberId } = unwrap(await inviteMember(owner.id, { name: "Boomerang", email }));
    const tokenA = await lastInviteToken();
    const account = await createAccount(null, email);
    unwrap(await acceptInvite(tokenA, account.id));
    unwrap(await deactivateMember(owner.id, memberId));

    unwrap(await inviteMember(owner.id, { name: "Boomerang", email }));
    const tokenB = await lastInviteToken();
    const result = unwrap(await acceptInvite(tokenB, account.id));
    expect(result.organisationProfileId).toBeTruthy();

    const row = await getDb().organisationMember.findUniqueOrThrow({ where: { id: memberId } });
    expect(row.status).toBe("active");
    expect(row.userId).toBe(account.id);
  });
});

describe("resendInvite / revokeInvite / deactivateMember scoping", () => {
  it("refuses to act on another organisation's member", async () => {
    const ownerA = await createOrgOwner();
    const ownerB = await createOrgOwner();
    const email = uniqueEmail();
    const { memberId } = unwrap(await inviteMember(ownerA.id, { name: "Scoped", email }));

    expect(await resendInvite(ownerB.id, memberId)).toEqual({ ok: false, reason: "not_found" });
    expect(await revokeInvite(ownerB.id, memberId)).toEqual({ ok: false, reason: "not_found" });

    const token = await lastInviteToken();
    const account = await createAccount(null, email);
    unwrap(await acceptInvite(token, account.id));
    expect(await deactivateMember(ownerB.id, memberId)).toEqual({
      ok: false,
      reason: "not_found",
    });

    // The owner's own actions still work.
    unwrap(await deactivateMember(ownerA.id, memberId));
    const row = await getDb().organisationMember.findUniqueOrThrow({ where: { id: memberId } });
    expect(row.status).toBe("deactivated");
  });

  it("revoke deletes a pending invite; resend reissues a fresh token", async () => {
    const owner = await createOrgOwner();
    const { memberId } = unwrap(
      await inviteMember(owner.id, { name: "Temp", email: uniqueEmail() }),
    );
    const tokenA = await lastInviteToken();

    unwrap(await resendInvite(owner.id, memberId));
    const tokenB = await lastInviteToken();
    expect(tokenB).not.toBe(tokenA);
    expect(await getInvite(tokenA)).toEqual({ status: "invalid" });
    expect(await getInvite(tokenB)).toMatchObject({ status: "valid" });

    unwrap(await revokeInvite(owner.id, memberId));
    expect(await getDb().organisationMember.findUnique({ where: { id: memberId } })).toBeNull();
  });
});

describe("listMembers", () => {
  it("lists newest first and computes expired", async () => {
    const owner = await createOrgOwner();
    const { memberId } = unwrap(
      await inviteMember(owner.id, { name: "Stale", email: uniqueEmail() }),
    );
    await getDb().organisationMember.update({
      where: { id: memberId },
      data: { inviteExpiresAt: new Date(Date.now() - 1000) },
    });
    unwrap(await inviteMember(owner.id, { name: "Fresh", email: uniqueEmail() }));

    const members = await listMembers(owner.id);
    expect(members).toHaveLength(2);
    expect(members[0].name).toBe("Fresh");
    const stale = members.find((member) => member.id === memberId);
    expect(stale?.expired).toBe(true);
    expect(members.find((member) => member.name === "Fresh")?.expired).toBe(false);
  });
});

describe("listInterviewerOptions", () => {
  it("includes the owner and only active hiring managers", async () => {
    const owner = await createOrgOwner();

    const activeEmail = uniqueEmail("active");
    unwrap(await inviteMember(owner.id, { name: "Active HM", email: activeEmail }));
    const activeToken = await lastInviteToken();
    const activeAccount = await createAccount(null, activeEmail);
    unwrap(await acceptInvite(activeToken, activeAccount.id));

    unwrap(await inviteMember(owner.id, { name: "Still Invited", email: uniqueEmail("pending") }));

    const deactivatedEmail = uniqueEmail("gone");
    const { memberId: deactivatedId } = unwrap(
      await inviteMember(owner.id, { name: "Gone HM", email: deactivatedEmail }),
    );
    const deactivatedToken = await lastInviteToken();
    const deactivatedAccount = await createAccount(null, deactivatedEmail);
    unwrap(await acceptInvite(deactivatedToken, deactivatedAccount.id));
    unwrap(await deactivateMember(owner.id, deactivatedId));

    const options = await listInterviewerOptions(owner.id);
    expect(options).toContainEqual({ userId: owner.id, name: "Org Owner", kind: "owner" });
    expect(options).toContainEqual({
      userId: activeAccount.id,
      name: "Test Account",
      kind: "hiring_manager",
    });
    expect(options.map((option) => option.userId)).not.toContain(deactivatedAccount.id);
    expect(options).toHaveLength(2);
  });
});

describe("assignInitialRole", () => {
  it("refuses to assign the hiring_manager role", async () => {
    const account = await createAccount(null);
    expect(await assignInitialRole(account.id, "hiring_manager")).toBe(false);
    const refreshed = await getDb().user.findUniqueOrThrow({ where: { id: account.id } });
    expect(refreshed.role).toBeNull();
  });
});
