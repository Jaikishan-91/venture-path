"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { GoogleButton } from "@/components/google-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { SIGN_IN_PATHS, type SignupRole } from "@/lib/roles";
import { signUp, type SignUpState } from "./actions";

const COPY: Record<SignupRole, { title: string; description: string }> = {
  user: { title: "Create your account", description: "Find freelance work and internships." },
  organisation: {
    title: "Create an organisation account",
    description:
      "Post freelance work and internships. An admin approves your organisation before its listings go live.",
  },
};

export function SignUpForm({ role, googleEnabled }: { role: SignupRole; googleEnabled: boolean }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUp.bind(null, role), {
    status: "idle",
  });
  useActionErrorToast(state);

  if (state.status === "sent") {
    return <CheckInbox email={state.email} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{COPY[role].title}</CardTitle>
        <CardDescription>{COPY[role].description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{role === "organisation" ? "Your name" : "Name"}</Label>
            <Input id="name" name="name" autoComplete="name" required maxLength={100} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
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
          <Button type="submit" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        {googleEnabled && <GoogleButton role={role} />}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={SIGN_IN_PATHS[role]} className="underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function CheckInbox({ email }: { email: string }) {
  const [sending, setSending] = useState(false);

  useEffect(() => {
    toast.success(`Account created. We sent a verification link to ${email}.`);
  }, [email]);

  async function onResend() {
    setSending(true);
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/dashboard" });
    setSending(false);
    if (error) toast.error("Couldn't resend right now. Try again in a minute.");
    else toast.success("Verification email sent again.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          We sent a verification link to {email}. Open it to finish creating your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button variant="outline" onClick={onResend} disabled={sending}>
          Resend verification email
        </Button>
      </CardContent>
    </Card>
  );
}
