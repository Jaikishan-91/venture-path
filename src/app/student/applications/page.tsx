import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listStudentApplications } from "@/lib/applications";
import { requireRole } from "@/lib/authz";
import { withdrawAction } from "@/app/opportunities/[id]/actions";

export const metadata: Metadata = { title: "Your applications · VenturePath" };

const STATUS_LABEL = {
  submitted: "Waiting for a decision",
  accepted: "Accepted",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};

export default async function StudentApplicationsPage() {
  const session = await requireRole("student");
  const applications = await listStudentApplications(session.user.id);

  return (
    <RoleHome title="Your applications" name={session.user.name}>
      {applications.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You have not applied yet.{" "}
          <Link href="/opportunities" className="underline">
            Browse opportunities
          </Link>
        </p>
      )}
      {applications.map((application) => (
        <Card key={application.id}>
          <CardHeader>
            <CardTitle>{application.opportunity.title}</CardTitle>
            <CardDescription>
              {application.opportunity.msmeProfile.businessName} ·{" "}
              {STATUS_LABEL[application.status]}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {application.status === "accepted" && (
              <p>Contact: {application.opportunity.msmeProfile.user.email}</p>
            )}
            <Link href={`/opportunities/${application.opportunity.id}`} className="underline">
              View listing
            </Link>
            {application.status === "submitted" && (
              <form action={withdrawAction}>
                <input type="hidden" name="applicationId" value={application.id} />
                <button type="submit" className="underline">
                  Withdraw
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      ))}
    </RoleHome>
  );
}
