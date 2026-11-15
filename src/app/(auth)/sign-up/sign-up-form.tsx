"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { GoogleButton } from "@/components/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { SIGN_IN_PATHS, type SignupRole } from "@/lib/roles";
import { AuthError, AuthField, AuthHeading, OrDivider, Spinner } from "../auth-parts";
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
    <div className="flex flex-col gap-6">
      <AuthHeading title={COPY[role].title} description={COPY[role].description} />
      <form action={action} className="flex flex-col gap-4">
        <AuthField>
          <Label htmlFor="name">{role === "organisation" ? "Your name" : "Name"}</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={100} />
        </AuthField>
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
        <AuthError message={state.status === "error" ? state.message : undefined} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      {googleEnabled && (
        <>
          <OrDivider />
          <GoogleButton role={role} />
        </>
      )}
      <p className="border-t border-[#f0f0f0] pt-5 text-center text-[14px] text-[#525252]">
        Already have an account?{" "}
        <Link
          href={SIGN_IN_PATHS[role]}
          className="font-medium text-[#121212] underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
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
    <div className="flex flex-col gap-6">
      <span className="flex size-11 items-center justify-center rounded-xl border border-[#e5e5e5] bg-[#fafafa] text-[#404040]">
        <MailCheck aria-hidden className="size-5" />
      </span>
      <AuthHeading
        title="Check your inbox"
        description={`We sent a verification link to ${email}. Open it to finish creating your account.`}
      />
      <Button variant="outline" className="w-full" onClick={onResend} disabled={sending}>
        {sending && <Spinner />}
        Resend verification email
      </Button>
      <p className="text-[13px] text-[#737373]">
        Can&apos;t find it? Check your spam folder, or resend the link.
      </p>
    </div>
  );
}
