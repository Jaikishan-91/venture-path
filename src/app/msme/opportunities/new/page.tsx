import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { todayInIndia } from "@/lib/opportunity-schemas";
import { getMsmeProfile } from "@/lib/profiles";
import { NotApproved } from "../not-approved";
import { OpportunityForm } from "../opportunity-form";

export const metadata: Metadata = { title: "New listing · VenturePath" };

export default async function NewOpportunityPage() {
  const session = await requireRole("msme");
  const profile = await getMsmeProfile(session.user.id);

  return (
    <RoleHome title="New listing" name={session.user.name}>
      {profile?.status === "approved" ? (
        <OpportunityForm
          minDeadline={todayInIndia()}
          initial={{
            id: "",
            type: "internship",
            title: "",
            description: "",
            skills: "",
            workMode: "remote",
            city: "",
            payType: "paid",
            payAmount: "",
            payPeriod: "month",
            duration: "",
            deadline: "",
          }}
        />
      ) : (
        <NotApproved />
      )}
    </RoleHome>
  );
}
