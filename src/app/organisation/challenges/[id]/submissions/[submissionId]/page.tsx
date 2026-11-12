import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getChallengeSubmission } from "@/lib/challenge-reviews";
import { CRITERION_SCORE_MAX, formatInr } from "@/lib/challenge-schemas";
import { listOwnPublishedListings } from "@/lib/challenges";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { CHALLENGE_SCORE_MAX } from "@/lib/v2/types";
import { DecisionPanel } from "../decision-panel";
import { PLACEMENT_BADGES, ScoreText } from "../score";

export const metadata: Metadata = { title: "Submission · VenturePath" };

export default async function SubmissionPage({
  params,
}: PageProps<"/organisation/challenges/[id]/submissions/[submissionId]">) {
  const session = await requireRole("organisation");
  const { id, submissionId } = await params;
  const submission = await getChallengeSubmission(session.user.id, id, submissionId);
  if (!submission) notFound();
  const { challenge } = submission;
  const listings = challenge.rewardHire ? await listOwnPublishedListings(session.user.id) : [];
  const student = submission.userProfile;

  return (
    <RoleHome title={student.user.name} name={session.user.name}>
      <Link
        href={`/organisation/challenges/${challenge.id}/submissions`}
        className="text-sm text-[#26594a] underline"
      >
        All submissions to “{challenge.title}”
      </Link>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {student.course}, {student.institution} · Submitted{" "}
              {formatIndiaDateTime(submission.updatedAt)}
            </span>
            {submission.placement !== "none" && (
              <span className="rounded-md bg-[#e3efe9] px-2 py-0.5 text-xs text-[#26594a]">
                {PLACEMENT_BADGES[submission.placement]}
              </span>
            )}
          </div>
          {submission.similarTo && (
            <p role="status" className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
              Looks very similar to{" "}
              <Link
                href={`/organisation/challenges/${challenge.id}/submissions/${submission.similarTo}`}
                className="underline"
              >
                another submission
              </Link>
              . Compare them before you decide.
            </p>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">Solution</h2>
            <p className="whitespace-pre-line break-words text-sm">{submission.text}</p>
            {submission.link && (
              <a
                href={submission.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all text-sm underline"
              >
                {submission.link}
              </a>
            )}
            {submission.fileName && (
              <a
                href={`/api/challenge-submissions/${submission.id}/file`}
                className="text-sm underline"
              >
                Download {submission.fileName}
              </a>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-[#e2e5e7]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium">AI breakdown</h2>
              <ScoreText
                score={submission.aiScore}
                status={submission.aiScoreStatus}
                max={CHALLENGE_SCORE_MAX}
              />
            </div>
            {submission.aiReason && <p className="text-sm">{submission.aiReason}</p>}
            {submission.breakdown.length > 0 ? (
              <ul className="flex flex-col gap-3 text-sm">
                {submission.breakdown.map((item) => (
                  <li key={item.criterion} className="flex flex-col gap-1">
                    <span className="font-medium">
                      {item.criterion} · {item.score}/{CRITERION_SCORE_MAX}
                    </span>
                    {item.quote && (
                      <span className="italic text-muted-foreground">“{item.quote}”</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {submission.aiScoreStatus === "pending"
                  ? "AI is still scoring this solution. Reload in a moment."
                  : "No AI breakdown for this solution. Read it and decide yourself."}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              AI only sorts and explains. Quotes are the student&apos;s own words. You decide.
            </p>
          </section>
        </div>

        <DecisionPanel
          challengeId={challenge.id}
          submissionId={submission.id}
          challengeStatus={challenge.status}
          placement={submission.placement}
          rewardStatus={submission.rewardStatus}
          rewardMoney={
            challenge.rewardMoneyInr !== null ? formatInr(challenge.rewardMoneyInr) : null
          }
          rewardHire={challenge.rewardHire}
          listings={listings}
        />
      </div>
    </RoleHome>
  );
}
