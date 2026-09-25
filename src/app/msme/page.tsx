import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";

export const metadata: Metadata = { title: "MSME · VenturePath" };

export default async function MsmeHomePage() {
  const session = await requireRole("msme");
  return (
    <RoleHome title="MSME dashboard" name={session.user.name}>
      <p className="text-muted-foreground">Your business profile and listings will appear here.</p>
    </RoleHome>
  );
}
