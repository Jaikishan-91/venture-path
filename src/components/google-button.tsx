"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GoogleButton() {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
    if (error) setPending(false);
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={pending}>
      Continue with Google
    </Button>
  );
}
