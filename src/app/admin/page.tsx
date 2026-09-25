import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";
import { countMsmesByStatus } from "@/lib/msme-review";

export const metadata: Metadata = { title: "Admin · VenturePath" };

export default async function AdminHomePage() {
  const session = await requireRole("admin");
  const counts = await countMsmesByStatus();

  return (
    <RoleHome title="Admin dashboard" name={session.user.name}>
      <Card>
        <CardHeader>
          <CardTitle>MSME reviews</CardTitle>
          <CardDescription>
            {counts.pending === 1
              ? "1 MSME is waiting for review."
              : `${counts.pending} MSMEs are waiting for review.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/msmes" className={buttonVariants()}>
            Review MSMEs
          </Link>
        </CardContent>
      </Card>
    </RoleHome>
  );
}
