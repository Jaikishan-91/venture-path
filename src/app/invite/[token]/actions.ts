"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { requireSession } from "@/lib/authz";
import { flash } from "@/lib/flash";
import { getLogger } from "@/lib/logger";
import { acceptInvite, getInvite } from "@/lib/team";
import type { AcceptInviteFailure } from "@/lib/hiring/types";

export type InviteSignUpState =
  { status: "idle" } | { status: "error"; message: string } | { status: "sent"; email: string };

const signUpSchema = z
  .object({
    token: z.string().trim().min(1),
    name: z.string().trim().min(1, "Enter your name").max(100),
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

/**
 * Signs up for an invited email without assigning any role (`acceptInvite` does that once the
 * verification link brings them back here, signed in). Mirrors `src/app/(auth)/sign-up/actions.ts`.
 */
export async function signUpForInviteAction(
  _prev: InviteSignUpState,
  formData: FormData,
): Promise<InviteSignUpState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const { token, name, email, password } = parsed.data;

  const invite = await getInvite(token);
  if (invite.status !== "valid" || invite.email !== email) {
    return {
      status: "error",
      message: "This invite is no longer valid. Refresh the page and try again.",
    };
  }

  try {
    await getAuth().api.signUpEmail({
      body: { name, email, password, callbackURL: `/invite/${token}` },
    });
  } catch (err) {
    if (err instanceof APIError) return { status: "error", message: err.message };
    getLogger().error({ err }, "invite sign-up failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  return { status: "sent", email };
}

const ACCEPT_ERRORS: Record<AcceptInviteFailure, string> = {
  invalid: "This invite has already been used or is no longer valid.",
  expired: "This invite has expired. Ask your organisation to send a new one.",
  email_mismatch: "Sign in with the email address this invite was sent to.",
  other_role:
    "This account is already a user or organisation account. Accept the invite with a different email.",
  member_elsewhere: "This account is already a hiring manager at another organisation.",
};

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const token = formData.get("token");
  if (typeof token !== "string" || !token) return;

  const result = await acceptInvite(token, session.user.id);
  if (!result.ok) {
    await flash("error", ACCEPT_ERRORS[result.reason]);
    revalidatePath(`/invite/${token}`);
    return;
  }

  await flash("success", "You're in. Welcome to the team.");
  redirect("/hiring-manager");
}
