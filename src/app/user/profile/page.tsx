import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getUserProfile } from "@/lib/profiles";
import { UserProfileForm } from "./user-profile-form";

export const metadata: Metadata = { title: "Your profile · VenturePath" };

export default async function UserProfilePage() {
  const session = await requireRole("user");
  const profile = await getUserProfile(session.user.id);

  return (
    <RoleHome
      title={profile ? "Edit your profile" : "Create your profile"}
      name={session.user.name}
    >
      <UserProfileForm
        initial={{
          institution: profile?.institution ?? "",
          course: profile?.course ?? "",
          graduationYear: profile ? String(profile.graduationYear) : "",
          skills: profile?.skills.join(", ") ?? "",
          bio: profile?.bio ?? "",
          links: profile?.links.join("\n") ?? "",
        }}
      />
    </RoleHome>
  );
}
