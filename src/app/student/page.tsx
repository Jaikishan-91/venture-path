import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";

export const metadata: Metadata = { title: "Student · VenturePath" };

export default async function StudentHomePage() {
  const session = await requireRole("student");
  return (
    <RoleHome title="Student dashboard" name={session.user.name}>
      <p className="text-muted-foreground">Your profile and opportunities will appear here.</p>
    </RoleHome>
  );
}
