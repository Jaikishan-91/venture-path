import { UserPlus } from "lucide-react";
import { AuthHeading } from "@/app/(auth)/auth-parts";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
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
      <span className="flex size-11 items-center justify-center rounded-xl border border-[#e5e5e5] bg-[#fafafa] text-[#404040]">
        <UserPlus aria-hidden className="size-5" />
      </span>
      <AuthHeading
        title={`Join ${organisationName}`}
        description={
          mismatch
            ? `This invite was sent to ${inviteEmail}, but you're signed in as ${sessionEmail}. Sign out and sign in with the invited address to accept.`
            : `Accept this invite as ${organisationName}'s hiring manager, signed in as ${sessionEmail}.`
        }
      />
      {mismatch ? (
        <div className="flex">
          <SignOutButton />
        </div>
      ) : (
        <form action={acceptInviteAction}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" className="w-full">
            Accept invite
          </Button>
        </form>
      )}
    </>
  );
}
