import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getOrganisationProfile } from "@/lib/profiles";
import { OrganisationProfileForm } from "./organisation-profile-form";

export const metadata: Metadata = { title: "Business profile · VenturePath" };

export default async function OrganisationProfilePage() {
  const session = await requireRole("organisation");
  const profile = await getOrganisationProfile(session.user.id);

  return (
    <RoleHome
      title={profile ? "Edit business profile" : "Create business profile"}
      name={session.user.name}
    >
      <OrganisationProfileForm
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
