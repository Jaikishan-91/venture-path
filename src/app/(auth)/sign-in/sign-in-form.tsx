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
import {
  SIGN_IN_PATHS,
  SIGN_UP_PATHS,
  isGoogleContinueRole,
  isSignupRole,
  type Role,
} from "@/lib/roles";
import { signInAs, type SignInState } from "./actions";

const COPY: Record<Role, { title: string; description: string }> = {
  user: { title: "Sign in", description: "Find freelance work and internships." },
  organisation: {
    title: "Organisation sign in",
    description: "Post work and review who applied.",
  },
  admin: { title: "Admin sign in", description: "Review organisations and manage settings." },
  hiring_manager: {
    title: "Hiring manager sign in",
    description: "See your interviews and share feedback.",
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  google:
    "Couldn't sign in with Google. If you already signed up with this email and a password, sign in with your password instead.",
};

function wrongRoleGoogleMessage(role: Role): string {
  return role === "hiring_manager"
    ? "That Google account belongs to a different account type. Hiring managers join through an invite link from their organisation."
    : "That Google account belongs to a different account type. Use the sign-in page for your account type.";
}

export function SignInForm({
  role,
  googleEnabled,
  error,
  inviteToken,
}: {
  role: Role;
  googleEnabled: boolean;
  error?: string;
  /** For `hiring_manager` sign-in reached from an invite link (`?invite=`): resumes to accept it. */
  inviteToken?: string;
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
    if (!error) return;
    if (error === "wrong-role") {
      toast.error(wrongRoleGoogleMessage(role), { id: "sign-in-wrong-role" });
    } else if (ERROR_MESSAGES[error]) {
      toast.error(ERROR_MESSAGES[error], { id: `sign-in-${error}` });
    }
  }, [error, role]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{COPY[role].title}</CardTitle>
        <CardDescription>{COPY[role].description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={action} className="flex flex-col gap-4">
          {inviteToken && <input type="hidden" name="invite" value={inviteToken} />}
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
        {googleEnabled && isGoogleContinueRole(role) && <GoogleButton role={role} />}
        {isSignupRole(role) && (
          <p className="text-center text-sm text-muted-foreground">
            New to VenturePath?{" "}
            <Link href={SIGN_UP_PATHS[role]} className="underline">
              Create {role === "organisation" ? "an organisation" : "an"} account
            </Link>
          </p>
        )}
        {role === "hiring_manager" && (
          <p className="text-center text-sm text-muted-foreground">
            Hiring managers join through an invite from their organisation.
          </p>
        )}
        <OtherSignInLinks role={role} />
      </CardContent>
    </Card>
  );
}

export function OtherSignInLinks({ role }: { role: Role }) {
  const showSeparator = role !== "user" && role !== "organisation";
  return (
    <p className="text-center text-xs text-muted-foreground">
      {role !== "user" && (
        <Link href={SIGN_IN_PATHS.user} className="underline">
          User sign in
        </Link>
      )}
      {showSeparator && " · "}
      {role !== "organisation" && (
        <Link href={SIGN_IN_PATHS.organisation} className="underline">
          Organisation sign in
        </Link>
      )}
    </p>
  );
}
