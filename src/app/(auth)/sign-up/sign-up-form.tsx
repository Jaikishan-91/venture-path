"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { GoogleButton } from "@/components/google-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { signUp, type SignUpState } from "./actions";

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUp, {
    status: "idle",
  });

  if (state.status === "sent") {
    return <CheckInbox email={state.email} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Find work as a student, or post it as an MSME.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={action} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">I am</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="student" defaultChecked /> A student
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="msme" /> An MSME (business)
            </label>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
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
          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        {googleEnabled && <GoogleButton />}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function CheckInbox({ email }: { email: string }) {
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onResend() {
    setResend("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/dashboard" });
    setResend(error ? "error" : "sent");
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
        <Button variant="outline" onClick={onResend} disabled={resend === "sending"}>
          Resend verification email
        </Button>
        {resend === "sent" && <p className="text-sm text-muted-foreground">Sent again.</p>}
        {resend === "error" && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t resend right now. Try again in a minute.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
