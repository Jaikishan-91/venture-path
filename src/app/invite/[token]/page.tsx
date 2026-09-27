import type { Metadata } from "next";
import { PublicFrame } from "@/components/public-frame";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { getInvite } from "@/lib/team";
import { AcceptInviteCard } from "./accept-invite-card";
import { JoinInviteCard } from "./join-invite-card";

export const metadata: Metadata = { title: "Team invite · VenturePath" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, session] = await Promise.all([getInvite(token), getSession()]);

  return (
    <PublicFrame>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-sm">
          {invite.status !== "valid" ? (
            <CardHeader>
              <CardTitle>
                {invite.status === "expired" ? "Invite expired" : "Invite not found"}
              </CardTitle>
              <CardDescription>
                {invite.status === "expired"
                  ? "This invite link has expired. Ask your organisation to send you a new one."
                  : "This invite link isn't valid. Check that you copied the whole link, or ask your organisation to send a new invite."}
              </CardDescription>
            </CardHeader>
          ) : session ? (
            <AcceptInviteCard
              token={token}
              organisationName={invite.organisationName}
              inviteEmail={invite.email}
              sessionEmail={session.user.email}
            />
          ) : (
            <JoinInviteCard
              token={token}
              organisationName={invite.organisationName}
              name={invite.name}
              email={invite.email}
              googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)}
            />
          )}
        </Card>
      </main>
    </PublicFrame>
  );
}
