import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";

export const metadata: Metadata = { title: "No access · VenturePath" };

/**
 * Reached only when the account has the `hiring_manager` role but no active membership: it was
 * deactivated, or the role predates the invite it came from being revoked. Uses `requireRole`
 * directly (never `requireActiveHiringManager`, which would redirect back here).
 */
export default async function HiringManagerInactivePage() {
  const session = await requireRole("hiring_manager");

  return (
    <RoleHome title="No access" name={session.user.name}>
      <Card>
        <CardHeader>
          <CardTitle>Your access was removed</CardTitle>
          <CardDescription>
            Your organisation has removed your hiring manager access, or it was never activated. You
            can no longer see interviews or submit feedback. If this is unexpected, contact the
            organisation that invited you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </RoleHome>
  );
}
