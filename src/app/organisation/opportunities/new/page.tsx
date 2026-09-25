import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { todayInIndia } from "@/lib/opportunity-schemas";
import { createLlmClient } from "@/lib/llm/provider";
import { getOrganisationProfile } from "@/lib/profiles";
import { NotApproved } from "../not-approved";
import { OpportunityForm } from "../opportunity-form";

export const metadata: Metadata = { title: "New listing · VenturePath" };

export default async function NewOpportunityPage() {
  const session = await requireRole("organisation");
  const profile = await getOrganisationProfile(session.user.id);

  return (
    <RoleHome title="New listing" name={session.user.name}>
      {profile?.status === "approved" ? (
        <OpportunityForm
          minDeadline={todayInIndia()}
          questions={[]}
          aiEnabled={createLlmClient() !== null}
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
            requirements: "",
            experienceLevel: "",
            compensationMin: "",
            compensationMax: "",
          }}
        />
      ) : (
        <NotApproved />
      )}
    </RoleHome>
  );
}
