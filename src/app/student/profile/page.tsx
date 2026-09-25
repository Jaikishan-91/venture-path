import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getStudentProfile } from "@/lib/profiles";
import { StudentProfileForm } from "./student-profile-form";

export const metadata: Metadata = { title: "Your profile · VenturePath" };

export default async function StudentProfilePage() {
  const session = await requireRole("student");
  const profile = await getStudentProfile(session.user.id);

  return (
    <RoleHome
      title={profile ? "Edit your profile" : "Create your profile"}
      name={session.user.name}
    >
      <StudentProfileForm
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
