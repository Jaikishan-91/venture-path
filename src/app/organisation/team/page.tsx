import { UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { getOrganisationProfile } from "@/lib/profiles";
import { listMembers } from "@/lib/team";
import { InviteForm } from "./invite-form";
import { MembersTable } from "./members-table";

export const metadata: Metadata = { title: "Team · Venture Path" };

export default async function TeamPage() {
  const session = await requireRole("organisation");
  const profile = await getOrganisationProfile(session.user.id);

  if (!profile) {
    return (
      <RoleHome
        title="Team"
        name={session.user.name}
        description="Invite hiring managers to run interviews with you."
      >
        <section className="flex flex-col items-start gap-4 rounded-xl border border-[#e5e5e5] bg-white p-6">
          <span className="flex size-10 items-center justify-center rounded-full bg-[#f5f5f5] text-[#737373]">
            <Users aria-hidden className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-semibold text-[#121212]">
              Create your business profile
            </h2>
            <p className="max-w-lg text-[14px] text-[#737373]">
              You need a business profile before you can invite hiring managers.
            </p>
          </div>
          <Link href="/organisation/profile" className={buttonVariants({ size: "sm" })}>
            Create profile
          </Link>
        </section>
      </RoleHome>
    );
  }

  const members = await listMembers(session.user.id);
  const active = members.filter((member) => member.status === "active").length;

  return (
    <RoleHome
      title="Team"
      name={session.user.name}
      description="Hiring managers only see the interviews they're assigned to and can share feedback — they can't see your other listings, applicants, or business profile."
      actions={
        <a href="#invite" className={buttonVariants({ size: "sm" })}>
          <UserPlus data-icon="inline-start" />
          Invite
        </a>
      }
    >
      <InviteForm />
      <DashboardSection
        title="Hiring managers"
        description={`Invited, active and former members of your team · ${active} active`}
      >
        <MembersTable members={members} />
      </DashboardSection>
    </RoleHome>
  );
}
