import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";
import { getOrganisationProfile } from "@/lib/profiles";
import { listMembers } from "@/lib/team";
import { InviteForm } from "./invite-form";
import { MembersTable } from "./members-table";

export const metadata: Metadata = { title: "Team · VenturePath" };

export default async function TeamPage() {
  const session = await requireRole("organisation");
  const profile = await getOrganisationProfile(session.user.id);

  return (
    <RoleHome title="Team" name={session.user.name}>
      {profile ? (
        <>
          <p className="text-sm text-[#4a4d53]">
            Hiring managers only see the interviews they&apos;re assigned to and can share feedback
            — they can&apos;t see your other listings, applicants, or business profile.
          </p>
          <InviteForm />
          <Card>
            <CardHeader>
              <CardTitle>Hiring managers</CardTitle>
              <CardDescription>Invited, active and former members of your team.</CardDescription>
            </CardHeader>
            <CardContent>
              <MembersTable members={await listMembers(session.user.id)} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create your business profile</CardTitle>
            <CardDescription>
              You need a business profile before you can invite hiring managers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/organisation/profile" className={buttonVariants()}>
              Create profile
            </Link>
          </CardContent>
        </Card>
      )}
    </RoleHome>
  );
}
