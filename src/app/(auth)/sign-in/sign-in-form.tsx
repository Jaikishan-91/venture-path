"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { GoogleButton } from "@/components/google-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SIGN_IN_PATHS, SIGN_UP_PATHS, type Role } from "@/lib/roles";
import { signInAs, type SignInState } from "./actions";

const COPY: Record<Role, { title: string; description: string }> = {
  user: { title: "Sign in", description: "Find freelance work and internships." },
  organisation: {
    title: "Organisation sign in",
    description: "Post work and review who applied.",
  },
  admin: { title: "Admin sign in", description: "Review organisations and manage settings." },
};

const ERROR_MESSAGES: Record<string, string> = {
  google:
    "Couldn't sign in with Google. If you already signed up with this email and a password, sign in with your password instead.",
  "wrong-role":
    "That Google account belongs to a different account type. Use the sign-in page for your account type.",
};

export function SignInForm({
  role,
  googleEnabled,
  error,
}: {
  role: Role;
  googleEnabled: boolean;
  error?: string;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signInAs.bind(null, role),
    { status: "idle" },
  );
  useActionErrorToast(
    state,
    state.status === "error" && state.signInPath
      ? { label: "Go there", href: state.signInPath }
      : undefined,
  );

  useEffect(() => {
    if (error && ERROR_MESSAGES[error])
      toast.error(ERROR_MESSAGES[error], { id: `sign-in-${error}` });
  }, [error]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{COPY[role].title}</CardTitle>
        <CardDescription>{COPY[role].description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={action} className="flex flex-col gap-4">
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
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        {googleEnabled && role !== "admin" && <GoogleButton role={role} />}
        {role !== "admin" && (
          <p className="text-center text-sm text-muted-foreground">
            New to VenturePath?{" "}
            <Link href={SIGN_UP_PATHS[role]} className="underline">
              Create {role === "organisation" ? "an organisation" : "an"} account
            </Link>
          </p>
        )}
        <OtherSignInLinks role={role} />
      </CardContent>
    </Card>
  );
}

export function OtherSignInLinks({ role }: { role: Role }) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      {role !== "user" && (
        <Link href={SIGN_IN_PATHS.user} className="underline">
          User sign in
        </Link>
      )}
      {role === "admin" && " · "}
      {role !== "organisation" && (
        <Link href={SIGN_IN_PATHS.organisation} className="underline">
          Organisation sign in
        </Link>
      )}
    </p>
  );
}
