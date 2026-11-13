import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";
import { daysLeftLabel, formatReward } from "@/lib/challenge-schemas";
import { listOwnChallenges } from "@/lib/challenges";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { getOrganisationProfile } from "@/lib/profiles";
import { CHALLENGE_STATUS_LABELS } from "@/lib/v2/types";
import { StatusButtons } from "./status-buttons";

export const metadata: Metadata = { title: "Your challenges · Venture Path" };

export default async function OrganisationChallengesPage() {
  const session = await requireRole("organisation");
  const [profile, challenges] = await Promise.all([
    getOrganisationProfile(session.user.id),
    listOwnChallenges(session.user.id),
  ]);
  const approved = profile?.status === "approved";

  return (
    <RoleHome title="Your challenges" name={session.user.name}>
      <p className="max-w-2xl text-sm text-[#737373]">
        Post a real problem from your business with a reward. Students send solutions, AI sorts
        them, and you pick the winner.
      </p>
      {approved ? (
        <Link
          href="/organisation/challenges/new"
          className={buttonVariants({ className: "self-start" })}
        >
          Post a challenge
        </Link>
      ) : (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {profile
            ? "Your business needs admin approval before you can post challenges."
            : "Create your business profile and get it approved to post challenges."}
        </p>
      )}

      {challenges.length === 0 && (
        <p className="text-sm text-muted-foreground">No challenges yet.</p>
      )}
      {challenges.map((challenge) => (
        <article key={challenge.id} aria-label={challenge.title}>
          <Card>
            <CardHeader>
              <CardTitle>{challenge.title}</CardTitle>
              <CardDescription>
                {CHALLENGE_STATUS_LABELS[challenge.status]} · {formatReward(challenge)} ·{" "}
                {challenge._count.submissions} submission
                {challenge._count.submissions === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="text-muted-foreground">
                Deadline {formatIndiaDateTime(challenge.deadline)}
                {challenge.status === "open" && ` · ${daysLeftLabel(challenge.deadline)}`}
              </p>
              <div className="flex flex-wrap gap-2">
                {approved && (challenge.status === "draft" || challenge.status === "open") && (
                  <Link
                    href={`/organisation/challenges/${challenge.id}/edit`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Edit
                  </Link>
                )}
                {challenge.status !== "draft" && (
                  <Link
                    href={`/organisation/challenges/${challenge.id}/submissions`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Submissions
                  </Link>
                )}
                <StatusButtons id={challenge.id} status={challenge.status} />
              </div>
            </CardContent>
          </Card>
        </article>
      ))}
    </RoleHome>
  );
}
