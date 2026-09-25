import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";
import { listOwnOpportunities } from "@/lib/opportunities";
import {
  WORK_MODE_LABELS,
  formatPay,
  isDeadlinePassed,
  type OpportunityStatus,
} from "@/lib/opportunity-schemas";
import { getMsmeProfile } from "@/lib/profiles";
import { OpportunityActions } from "./opportunity-actions";

export const metadata: Metadata = { title: "Your listings · VenturePath" };

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

export default async function MsmeOpportunitiesPage() {
  const session = await requireRole("msme");
  const [profile, opportunities] = await Promise.all([
    getMsmeProfile(session.user.id),
    listOwnOpportunities(session.user.id),
  ]);
  const approved = profile?.status === "approved";

  return (
    <RoleHome title="Your listings" name={session.user.name}>
      <div className="flex flex-wrap items-center gap-3">
        {approved && (
          <Link href="/msme/opportunities/new" className={buttonVariants()}>
            New listing
          </Link>
        )}
        <Link href="/msme" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </div>
      {!approved && (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {profile
            ? "Your business needs admin approval before you can create, edit or publish listings. Students can't see your listings until then."
            : "Create your business profile and get it approved to post listings."}
        </p>
      )}

      {opportunities.length === 0 && (
        <p className="text-sm text-muted-foreground">No listings yet.</p>
      )}
      {opportunities.map((opportunity) => (
        <article key={opportunity.id} aria-label={opportunity.title}>
          <Card>
            <CardHeader>
              <CardTitle>{opportunity.title}</CardTitle>
              <CardDescription>
                {opportunity.type === "internship" ? "Internship" : "Freelance"} ·{" "}
                {STATUS_LABELS[opportunity.status]} · {formatPay(opportunity)} ·{" "}
                {WORK_MODE_LABELS[opportunity.workMode]}
                {opportunity.city && `, ${opportunity.city}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {opportunity.deadline && (
                <p className="text-muted-foreground">
                  Apply by{" "}
                  {opportunity.deadline.toLocaleDateString("en-IN", {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  })}
                  {isDeadlinePassed(opportunity.deadline) && " · Deadline passed"}
                </p>
              )}
              <OpportunityActions
                id={opportunity.id}
                status={opportunity.status}
                canEdit={approved}
              />
            </CardContent>
          </Card>
        </article>
      ))}
    </RoleHome>
  );
}
