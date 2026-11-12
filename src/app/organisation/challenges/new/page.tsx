import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { createLlmClient } from "@/lib/llm/provider";
import { todayInIndia } from "@/lib/opportunity-schemas";
import { getOrganisationProfile } from "@/lib/profiles";
import { NotApproved } from "../not-approved";
import { ChallengeForm } from "../challenge-form";

export const metadata: Metadata = { title: "Post a challenge · VenturePath" };

export default async function NewChallengePage() {
  const session = await requireRole("organisation");
  const profile = await getOrganisationProfile(session.user.id);

  return (
    <RoleHome title="Post a challenge" name={session.user.name}>
      {profile?.status === "approved" ? (
        <ChallengeForm
          minDeadline={todayInIndia()}
          aiEnabled={createLlmClient() !== null}
          locked={false}
          initial={{
            id: "",
            title: "",
            problem: "",
            goodSolution: "",
            criteria: [],
            rewardMoney: "",
            rewardHire: false,
            deadline: "",
            fileName: null,
            isDraft: true,
          }}
        />
      ) : (
        <NotApproved />
      )}
    </RoleHome>
  );
}
