import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";

export const metadata: Metadata = { title: "Admin · VenturePath" };

export default async function AdminHomePage() {
  const session = await requireRole("admin");
  return (
    <RoleHome title="Admin dashboard" name={session.user.name}>
      <p className="text-muted-foreground">MSME approvals will appear here.</p>
    </RoleHome>
  );
}
