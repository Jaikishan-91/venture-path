import { AlertTriangle, Download, ExternalLink, Info } from "lucide-react";
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
import { PlacementBadge, ScoreText } from "../score";

export const metadata: Metadata = { title: "Submission · Venture Path" };

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
    <RoleHome
      title={student.user.name}
      name={session.user.name}
      back={{
        href: `/organisation/challenges/${challenge.id}/submissions`,
        label: `All submissions to “${challenge.title}”`,
      }}
      description={`${student.course}, ${student.institution} · Submitted ${formatIndiaDateTime(submission.updatedAt)}`}
      actions={<PlacementBadge placement={submission.placement} />}
    >
      {submission.similarTo && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[14px] text-[#92400e]"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Looks very similar to{" "}
            <Link
              href={`/organisation/challenges/${challenge.id}/submissions/${submission.similarTo}`}
              className="font-medium underline"
            >
              another submission
            </Link>
            . Compare them before you decide.
          </span>
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
          <div className="border-b border-[#f0f0f0] px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-[#121212]">Solution</h2>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-line text-[#262626]">
              {submission.text}
            </p>
            {(submission.link || submission.fileName) && (
              <div className="flex flex-col gap-2 border-t border-[#f0f0f0] pt-4">
                {submission.link && (
                  <a
                    href={submission.link}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex min-w-0 items-center gap-2 text-[14px] text-[#15803d] hover:underline"
                  >
                    <ExternalLink aria-hidden className="size-4 shrink-0" />
                    <span className="break-all">{submission.link}</span>
                  </a>
                )}
                {submission.fileName && (
                  <a
                    href={`/api/challenge-submissions/${submission.id}/file`}
                    className="inline-flex items-center gap-2 self-start rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-[14px] font-medium text-[#121212] hover:bg-white"
                  >
                    <Download aria-hidden className="size-4 shrink-0 text-[#737373]" />
                    Download {submission.fileName}
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
          <section className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0f0] px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-[#121212]">AI breakdown</h2>
              <ScoreText
                score={submission.aiScore}
                status={submission.aiScoreStatus}
                max={CHALLENGE_SCORE_MAX}
              />
            </div>
            <div className="flex flex-col gap-4 p-5">
              {submission.aiReason && (
                <p className="text-[14px] text-[#404040]">{submission.aiReason}</p>
              )}
              {submission.breakdown.length > 0 ? (
                <ul className="flex flex-col gap-4">
                  {submission.breakdown.map((item) => (
                    <li key={item.criterion} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="font-medium text-[#121212]">{item.criterion}</span>
                        <span className="shrink-0 text-[#525252] tabular-nums">
                          {item.score}/{CRITERION_SCORE_MAX}
                        </span>
                      </div>
                      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                        <div
                          className="h-full rounded-full bg-[#16a34a]"
                          style={{ width: `${(item.score / CRITERION_SCORE_MAX) * 100}%` }}
                        />
                      </div>
                      {item.quote && (
                        <span className="text-[13px] text-[#737373] italic">“{item.quote}”</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-[#737373]">
                  {submission.aiScoreStatus === "pending"
                    ? "AI is still scoring this solution. Reload in a moment."
                    : "No AI breakdown for this solution. Read it and decide yourself."}
                </p>
              )}
              <p className="flex items-start gap-1.5 border-t border-[#f0f0f0] pt-3 text-[12px] text-[#737373]">
                <Info aria-hidden className="mt-px size-3.5 shrink-0" />
                AI only sorts and explains. Quotes are the student&apos;s own words. You decide.
              </p>
            </div>
          </section>

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
      </div>
    </RoleHome>
  );
}
