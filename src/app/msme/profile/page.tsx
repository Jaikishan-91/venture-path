import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getMsmeProfile } from "@/lib/profiles";
import { MsmeProfileForm } from "./msme-profile-form";

export const metadata: Metadata = { title: "Business profile · VenturePath" };

export default async function MsmeProfilePage() {
  const session = await requireRole("msme");
  const profile = await getMsmeProfile(session.user.id);

  return (
    <RoleHome
      title={profile ? "Edit business profile" : "Create business profile"}
      name={session.user.name}
    >
      <MsmeProfileForm
        status={profile?.status ?? null}
        initial={{
          businessName: profile?.businessName ?? "",
          description: profile?.description ?? "",
          industry: profile?.industry ?? "",
          location: profile?.location ?? "",
          website: profile?.website ?? "",
        }}
      />
    </RoleHome>
  );
}
