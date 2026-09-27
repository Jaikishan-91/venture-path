"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
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
      <CardHeader>
        <CardTitle>Join {organisationName} on VenturePath</CardTitle>
        <CardDescription>
          You&apos;ve been invited as a hiring manager. Create an account with {email} to accept.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={email} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" defaultValue={name} autoComplete="name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-display">Email</Label>
            <Input id="email-display" value={email} disabled readOnly />
          </div>
          <div className="flex flex-col gap-2">
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
          </div>
          <div className="flex flex-col gap-2">
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
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        {googleEnabled && <InviteGoogleButton token={token} />}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={`/hiring-manager/sign-in?invite=${token}`} className="underline">
            Sign in
          </Link>
        </p>
      </CardContent>
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
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          We sent a verification link to {email}. Open it to finish creating your account and accept
          the invite.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={onResend} disabled={sending}>
          Resend verification email
        </Button>
      </CardContent>
    </>
  );
}
