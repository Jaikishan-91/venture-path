"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Google sign-in/up for the invite page. Unlike `@/components/google-button`, this never touches
 * `/auth/continue`: no role is assigned here, `acceptInvite` does that once they're back and
 * signed in on this same page.
 */
export function InviteGoogleButton({ token }: { token: string }) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const callbackURL = `/invite/${token}`;
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      newUserCallbackURL: callbackURL,
      errorCallbackURL: callbackURL,
    });
    if (error) {
      setPending(false);
      toast.error("Couldn't reach Google. Try again.");
    }
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={pending}>
      Continue with Google
    </Button>
  );
}
