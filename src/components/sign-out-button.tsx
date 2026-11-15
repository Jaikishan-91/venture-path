"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** `compact` is an icon button (still named "Sign out" for screen readers and tests). */
export function SignOutButton({ compact = false }: { compact?: boolean }) {
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

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        title="Sign out"
        onClick={onClick}
      >
        <LogOut />
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      Sign out
    </Button>
  );
}
