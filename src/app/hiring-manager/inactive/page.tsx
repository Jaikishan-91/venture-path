import { ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { SignOutButton } from "@/components/sign-out-button";
import { requireRole } from "@/lib/authz";

export const metadata: Metadata = { title: "No access · Venture Path" };

/**
 * Reached only when the account has the `hiring_manager` role but no active membership: it was
 * deactivated, or the role predates the invite it came from being revoked. Uses `requireRole`
 * directly (never `requireActiveHiringManager`, which would redirect back here).
 */
export default async function HiringManagerInactivePage() {
  const session = await requireRole("hiring_manager");

  return (
    <RoleHome title="No access" name={session.user.name}>
      <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-[#e5e5e5] bg-white px-6 py-10 text-center md:mt-8">
        <span className="flex size-11 items-center justify-center rounded-full border border-[#e5e5e5] bg-[#fafafa] text-[#737373]">
          <ShieldOff aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-2">
          <h2 className="text-[17px] font-semibold text-[#121212]">Your access was removed</h2>
          <p className="text-[14px] leading-relaxed text-[#737373]">
            Your organisation has removed your hiring manager access, or it was never activated. You
            can no longer see interviews or submit feedback. If this is unexpected, contact the
            organisation that invited you.
          </p>
        </div>
        <SignOutButton />
      </section>
    </RoleHome>
  );
}
