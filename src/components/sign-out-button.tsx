"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  async function onClick() {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error("Couldn't sign out. Try again.");
      return;
    }
    toast.success("Signed out.");
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={onClick}>
      Sign out
    </Button>
  );
}
