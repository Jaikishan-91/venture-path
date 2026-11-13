import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { listChallengeSubmissions } from "@/lib/challenge-reviews";
import { formatReward } from "@/lib/challenge-schemas";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { CHALLENGE_SCORE_MAX, CHALLENGE_STATUS_LABELS } from "@/lib/v2/types";
import { StatusButtons } from "../../status-buttons";
import { PLACEMENT_BADGES, ScoreText } from "./score";

export const metadata: Metadata = { title: "Submissions · Venture Path" };

export default async function ChallengeSubmissionsPage({
  params,
}: PageProps<"/organisation/challenges/[id]/submissions">) {
  const session = await requireRole("organisation");
  const { id } = await params;
  const data = await listChallengeSubmissions(session.user.id, id);
  if (!data) notFound();
  const { challenge, submissions } = data;

  return (
    <RoleHome title={challenge.title} name={session.user.name}>
      <Link href="/organisation/challenges" className="text-sm text-[#00994f] underline">
        All challenges
      </Link>
      <div className="flex flex-col gap-2 text-sm">
        <p>
          {CHALLENGE_STATUS_LABELS[challenge.status]} · {formatReward(challenge)} · Deadline{" "}
          {formatIndiaDateTime(challenge.deadline)}
        </p>
        <p className="text-muted-foreground">
          {challenge.status === "open" &&
            "Students can still submit or edit. You can pick a winner once submissions close."}
          {challenge.status === "judging" &&
            "Submissions are closed. Open a solution to pick the winner, then close the challenge."}
          {challenge.status === "done" && "This challenge is closed."}
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusButtons id={challenge.id} status={challenge.status} />
        </div>
      </div>

      <section aria-label="Submissions" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          {submissions.length} submission{submissions.length === 1 ? "" : "s"}
        </h2>
        <p className="text-xs text-muted-foreground">
          Sorted by AI score. AI only sorts and explains; you decide.
        </p>
        {submissions.length === 0 && (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        )}
        {submissions.length > 0 && (
          <div className="flex flex-col overflow-hidden rounded-2xl bg-white border border-[#e5e5e5] shadow-card">
            {submissions.map((submission) => (
              <Link
                key={submission.id}
                href={`/organisation/challenges/${challenge.id}/submissions/${submission.id}`}
                className="flex flex-col gap-1 border-b border-[#e5e5e5] px-5 py-4 transition-colors last:border-b-0 hover:bg-[#f5f5f5]"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#121212]">
                    {submission.userProfile.user.name}
                  </span>
                  <ScoreText
                    score={submission.aiScore}
                    status={submission.aiScoreStatus}
                    max={CHALLENGE_SCORE_MAX}
                  />
                  {submission.placement !== "none" && (
                    <span className="rounded-md bg-[#e6f9ef] px-2 py-0.5 text-xs text-[#00994f]">
                      {PLACEMENT_BADGES[submission.placement]}
                    </span>
                  )}
                  {submission.similar && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      Looks very similar to another submission
                    </span>
                  )}
                </span>
                {submission.aiReason && (
                  <span className="text-sm text-[#737373]">{submission.aiReason}</span>
                )}
                {submission.aiQuote ? (
                  <span className="text-sm italic text-muted-foreground">
                    “{submission.aiQuote}”
                  </span>
                ) : (
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {submission.text}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </RoleHome>
  );
}
