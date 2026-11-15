"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { GoogleButton } from "@/components/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SIGN_IN_PATHS,
  SIGN_UP_PATHS,
  isGoogleContinueRole,
  isSignupRole,
  type Role,
} from "@/lib/roles";
import { AuthError, AuthField, AuthHeading, OrDivider, Spinner } from "../auth-parts";
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
  nextPath,
}: {
  role: Role;
  googleEnabled: boolean;
  error?: string;
  /** For `hiring_manager` sign-in reached from an invite link (`?invite=`): resumes to accept it. */
  inviteToken?: string;
  /** Where to return after a user sign-in (only an AI interview link, see `safeNextPath`). */
  nextPath?: string;
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
    <div className="flex flex-col gap-6">
      <AuthHeading title={COPY[role].title} description={COPY[role].description} />
      <form action={action} className="flex flex-col gap-4">
        {inviteToken && <input type="hidden" name="invite" value={inviteToken} />}
        {nextPath && <input type="hidden" name="next" value={nextPath} />}
        <AuthField>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </AuthField>
        <AuthField>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </AuthField>
        <AuthError message={state.status === "error" ? state.message : undefined} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {googleEnabled && isGoogleContinueRole(role) && (
        <>
          <OrDivider />
          <GoogleButton role={role} />
        </>
      )}
      <div className="flex flex-col gap-2 border-t border-[#f0f0f0] pt-5 text-center">
        {isSignupRole(role) && (
          <p className="text-[14px] text-[#525252]">
            New to Venture Path?{" "}
            <Link
              href={SIGN_UP_PATHS[role]}
              className="font-medium text-[#121212] underline underline-offset-4"
            >
              Create {role === "organisation" ? "an organisation" : "an"} account
            </Link>
          </p>
        )}
        {role === "hiring_manager" && (
          <p className="text-[14px] text-[#525252]">
            Hiring managers join through an invite from their organisation.
          </p>
        )}
        <OtherSignInLinks role={role} />
      </div>
    </div>
  );
}

export function OtherSignInLinks({ role }: { role: Role }) {
  const showSeparator = role !== "user" && role !== "organisation";
  return (
    <p className="text-[13px] text-[#737373]">
      {role !== "user" && (
        <Link
          href={SIGN_IN_PATHS.user}
          className="underline underline-offset-4 hover:text-[#121212]"
        >
          User sign in
        </Link>
      )}
      {showSeparator && " · "}
      {role !== "organisation" && (
        <Link
          href={SIGN_IN_PATHS.organisation}
          className="underline underline-offset-4 hover:text-[#121212]"
        >
          Organisation sign in
        </Link>
      )}
    </p>
  );
}
