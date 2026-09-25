import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getOwnOpportunity } from "@/lib/opportunities";
import { todayInIndia } from "@/lib/opportunity-schemas";
import { getMsmeProfile } from "@/lib/profiles";
import { NotApproved } from "../../not-approved";
import { OpportunityForm } from "../../opportunity-form";

export const metadata: Metadata = { title: "Edit listing · VenturePath" };

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("msme");
  const { id } = await params;
  const [profile, opportunity] = await Promise.all([
    getMsmeProfile(session.user.id),
    getOwnOpportunity(session.user.id, id),
  ]);
  if (!opportunity) notFound();

  return (
    <RoleHome title="Edit listing" name={session.user.name}>
      {profile?.status === "approved" ? (
        <OpportunityForm
          minDeadline={todayInIndia()}
          initial={{
            id: opportunity.id,
            type: opportunity.type,
            title: opportunity.title,
            description: opportunity.description,
            skills: opportunity.skills.join(", "),
            workMode: opportunity.workMode,
            city: opportunity.city ?? "",
            payType: opportunity.payType,
            payAmount: opportunity.payAmount?.toString() ?? "",
            payPeriod: opportunity.payPeriod ?? "month",
            duration: opportunity.duration ?? "",
            deadline: opportunity.deadline?.toISOString().slice(0, 10) ?? "",
          }}
        />
      ) : (
        <NotApproved />
      )}
    </RoleHome>
  );
}
