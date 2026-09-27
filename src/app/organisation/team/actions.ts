"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { flash } from "@/lib/flash";
import { inviteMemberSchema } from "@/lib/team-schemas";
import { deactivateMember, inviteMember, resendInvite, revokeInvite } from "@/lib/team";
import { MAX_PENDING_INVITES, type InviteFailure } from "@/lib/hiring/types";

export type InviteState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success" };

const INVITE_ERRORS: Record<InviteFailure, string> = {
  not_found: "Create your business profile before inviting a hiring manager.",
  invalid: "Enter a name and a valid email address.",
  already_member: "This person is already on your team.",
  too_many_pending: `You already have ${MAX_PENDING_INVITES} pending invites. Revoke one before sending another.`,
  own_email: "You can't invite your own email address.",
};

export async function inviteMemberAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const session = await requireRole("organisation");
  const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  const result = await inviteMember(session.user.id, parsed.data);
  if (!result.ok) {
    return { status: "error", message: INVITE_ERRORS[result.reason] };
  }

  await flash("success", `Invite sent to ${parsed.data.email}.`);
  revalidatePath("/organisation/team");
  return { status: "success" };
}

const MEMBER_OPS = ["resend", "revoke", "deactivate"] as const;

const MEMBER_MESSAGES: Record<(typeof MEMBER_OPS)[number], { success: string; failure: string }> = {
  resend: { success: "Invite resent.", failure: "Couldn't resend that invite." },
  revoke: { success: "Invite revoked.", failure: "Couldn't revoke that invite." },
  deactivate: { success: "Removed from the team.", failure: "Couldn't remove that member." },
};

/** One action for every row button (Resend / Revoke / Deactivate / Invite again). */
export async function memberAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const memberId = formData.get("memberId");
  const op = formData.get("op");
  if (
    typeof memberId !== "string" ||
    !memberId ||
    !(MEMBER_OPS as readonly string[]).includes(String(op))
  ) {
    return;
  }

  const action = op as (typeof MEMBER_OPS)[number];
  const result = await (action === "resend"
    ? resendInvite(session.user.id, memberId)
    : action === "revoke"
      ? revokeInvite(session.user.id, memberId)
      : deactivateMember(session.user.id, memberId));

  if (!result.ok) {
    getLogger().warn(
      { orgUserId: session.user.id, memberId, action, reason: result.reason },
      "team member action failed",
    );
  }
  await flash(
    result.ok ? "success" : "error",
    result.ok ? MEMBER_MESSAGES[action].success : MEMBER_MESSAGES[action].failure,
  );
  revalidatePath("/organisation/team");
}

/** "Invite again" for a deactivated member reuses `inviteMember` with their stored name/email. */
export async function reinviteAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const name = formData.get("name");
  const email = formData.get("email");
  if (typeof name !== "string" || typeof email !== "string") return;

  const result = await inviteMember(session.user.id, { name, email });
  await flash(
    result.ok ? "success" : "error",
    result.ok ? `Invite sent to ${email}.` : INVITE_ERRORS[result.reason],
  );
  revalidatePath("/organisation/team");
}
