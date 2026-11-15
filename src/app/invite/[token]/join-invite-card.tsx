"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { AuthError, AuthField, AuthHeading, OrDivider, Spinner } from "@/app/(auth)/auth-parts";
import { signUpForInviteAction, type InviteSignUpState } from "./actions";
import { InviteGoogleButton } from "./invite-google-button";

export function JoinInviteCard({
  token,
  organisationName,
  name,
  email,
  googleEnabled,
}: {
  token: string;
  organisationName: string;
  name: string;
  email: string;
  googleEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<InviteSignUpState, FormData>(
    signUpForInviteAction,
    { status: "idle" },
  );
  useActionErrorToast(state);

  if (state.status === "sent") return <CheckInbox email={state.email} token={token} />;

  return (
    <>
      <AuthHeading
        title={`Join ${organisationName} on Venture Path`}
        description={`You've been invited as a hiring manager. Create an account with ${email} to accept.`}
      />
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
        <AuthField>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" defaultValue={name} autoComplete="name" required />
        </AuthField>
        <AuthField hint="Invites are tied to this address.">
          <Label htmlFor="email-display">Email</Label>
          <Input id="email-display" value={email} disabled readOnly />
        </AuthField>
        <AuthField hint="At least 8 characters.">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
          />
        </AuthField>
        <AuthField>
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
          />
        </AuthField>
        <AuthError message={state.status === "error" ? state.message : undefined} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      {googleEnabled && (
        <>
          <OrDivider />
          <InviteGoogleButton token={token} />
        </>
      )}
      <p className="border-t border-[#f0f0f0] pt-5 text-center text-[14px] text-[#525252]">
        Already have an account?{" "}
        <Link
          href={`/hiring-manager/sign-in?invite=${token}`}
          className="font-medium text-[#121212] underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

function CheckInbox({ email, token }: { email: string; token: string }) {
  const [sending, setSending] = useState(false);

  useEffect(() => {
    toast.success(`Account created. We sent a verification link to ${email}.`);
  }, [email]);

  async function onResend() {
    setSending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: `/invite/${token}`,
    });
    setSending(false);
    if (error) toast.error("Couldn't resend right now. Try again in a minute.");
    else toast.success("Verification email sent again.");
  }

  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-xl border border-[#e5e5e5] bg-[#fafafa] text-[#404040]">
        <MailCheck aria-hidden className="size-5" />
      </span>
      <AuthHeading
        title="Check your inbox"
        description={`We sent a verification link to ${email}. Open it to finish creating your account and accept the invite.`}
      />
      <Button variant="outline" className="w-full" onClick={onResend} disabled={sending}>
        {sending && <Spinner />}
        Resend verification email
      </Button>
    </>
  );
}
