import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";
import type { MsmeStatus } from "@/lib/profile-schemas";
import { getMsmeProfile } from "@/lib/profiles";

export const metadata: Metadata = { title: "MSME · VenturePath" };

const STATUS_TEXT: Record<MsmeStatus, { label: string; detail: string }> = {
  pending: {
    label: "Awaiting review",
    detail: "An admin will review your business. Your listings stay hidden until it's approved.",
  },
  approved: { label: "Approved", detail: "Students can see your published listings." },
  rejected: {
    label: "Not approved",
    detail: "Update your profile and save it to submit it for review again.",
  },
};

export default async function MsmeHomePage() {
  const session = await requireRole("msme");
  const profile = await getMsmeProfile(session.user.id);

  return (
    <RoleHome title="MSME dashboard" name={session.user.name}>
      {profile ? (
        <Card>
          <CardHeader>
            <CardTitle>{profile.businessName}</CardTitle>
            <CardDescription>
              {profile.industry} · {profile.location}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div role="status" className="rounded-md bg-muted p-3">
              <p className="font-medium">Status: {STATUS_TEXT[profile.status].label}</p>
              <p className="text-muted-foreground">{STATUS_TEXT[profile.status].detail}</p>
            </div>
            <p className="whitespace-pre-line">{profile.description}</p>
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all underline"
              >
                {profile.website}
              </a>
            )}
            <Link
              href="/msme/profile"
              className={buttonVariants({ variant: "outline", className: "self-start" })}
            >
              Edit profile
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create your business profile</CardTitle>
            <CardDescription>
              An admin reviews your business before your listings are shown to students.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/msme/profile" className={buttonVariants()}>
              Create profile
            </Link>
          </CardContent>
        </Card>
      )}
    </RoleHome>
  );
}
