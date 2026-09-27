import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInviteAction } from "./actions";

export function AcceptInviteCard({
  token,
  organisationName,
  inviteEmail,
  sessionEmail,
}: {
  token: string;
  organisationName: string;
  inviteEmail: string;
  sessionEmail: string;
}) {
  const mismatch = sessionEmail.toLowerCase() !== inviteEmail.toLowerCase();

  return (
    <>
      <CardHeader>
        <CardTitle>Join {organisationName}</CardTitle>
        <CardDescription>
          {mismatch
            ? `This invite was sent to ${inviteEmail}, but you're signed in as ${sessionEmail}. Sign out and sign in with the invited address to accept.`
            : `Accept this invite as ${organisationName}'s hiring manager, signed in as ${sessionEmail}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mismatch ? (
          <SignOutButton />
        ) : (
          <form action={acceptInviteAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit">Accept invite</Button>
          </form>
        )}
      </CardContent>
    </>
  );
}
