import { LinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/app/(auth)/auth-parts";
import { BrandLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { getInvite } from "@/lib/team";
import { AcceptInviteCard } from "./accept-invite-card";
import { JoinInviteCard } from "./join-invite-card";

export const metadata: Metadata = { title: "Team invite · Venture Path" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, session] = await Promise.all([getInvite(token), getSession()]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#fafafa] px-4 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:px-8">
      <header>
        <BrandLogo />
      </header>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border border-[#e5e5e5] bg-white p-6 sm:p-8">
          {invite.status !== "valid" ? (
            <>
              <span className="flex size-11 items-center justify-center rounded-xl border border-[#e5e5e5] bg-[#fafafa] text-[#404040]">
                <LinkIcon aria-hidden className="size-5" />
              </span>
              <AuthHeading
                title={invite.status === "expired" ? "Invite expired" : "Invite not found"}
                description={
                  invite.status === "expired"
                    ? "This invite link has expired. Ask your organisation to send you a new one."
                    : "This invite link isn't valid. Check that you copied the whole link, or ask your organisation to send a new invite."
                }
              />
              <Link
                href="/"
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                Go to Venture Path
              </Link>
            </>
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
        </div>
      </main>
    </div>
  );
}
