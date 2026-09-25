"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { SIGN_IN_PATHS, type SignupRole } from "@/lib/roles";

/** Google sign-in for one role's page; `/auth/continue` checks or assigns the role afterwards. */
export function GoogleButton({ role }: { role: SignupRole }) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const continueUrl = `/auth/continue?as=${role}`;
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: continueUrl,
      newUserCallbackURL: continueUrl,
      errorCallbackURL: `${SIGN_IN_PATHS[role]}?error=google`,
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
