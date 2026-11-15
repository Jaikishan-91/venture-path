import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { indiaDateOfDeadline } from "@/lib/challenge-schemas";
import { getOwnChallenge } from "@/lib/challenges";
import { createLlmClient } from "@/lib/llm/provider";
import { todayInIndia } from "@/lib/opportunity-schemas";
import { getOrganisationProfile } from "@/lib/profiles";
import { NotApproved } from "../../not-approved";
import { ChallengeForm } from "../../challenge-form";

export const metadata: Metadata = { title: "Edit challenge · Venture Path" };

export default async function EditChallengePage({
  params,
}: PageProps<"/organisation/challenges/[id]/edit">) {
  const session = await requireRole("organisation");
  const { id } = await params;
  const [profile, challenge] = await Promise.all([
    getOrganisationProfile(session.user.id),
    getOwnChallenge(session.user.id, id),
  ]);
  if (!challenge) notFound();
  const editable = challenge.status === "draft" || challenge.status === "open";

  return (
    <RoleHome
      title="Edit challenge"
      name={session.user.name}
      description={challenge.title}
      back={{ href: "/organisation/challenges", label: "Your challenges" }}
    >
      {profile?.status !== "approved" ? (
        <NotApproved />
      ) : !editable ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-[#e5e5e5] bg-white p-6 text-[14px] text-[#525252]">
          <p>Submissions have closed, so this challenge can&apos;t be edited.</p>
          <Link
            href={`/organisation/challenges/${challenge.id}/submissions`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            See submissions
          </Link>
        </div>
      ) : (
        <ChallengeForm
          key={challenge.updatedAt.getTime()}
          minDeadline={todayInIndia()}
          aiEnabled={createLlmClient() !== null}
          locked={challenge.criteriaLockedAt !== null}
          initial={{
            id: challenge.id,
            title: challenge.title,
            problem: challenge.problem,
            goodSolution: challenge.goodSolution ?? "",
            criteria: challenge.criteria,
            rewardMoney: challenge.rewardMoneyInr?.toString() ?? "",
            rewardHire: challenge.rewardHire,
            deadline: indiaDateOfDeadline(challenge.deadline),
            fileName: challenge.fileName,
            isDraft: challenge.status === "draft",
          }}
        />
      )}
    </RoleHome>
  );
}
