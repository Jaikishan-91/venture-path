import { ChevronRight, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { listChallengeSubmissions } from "@/lib/challenge-reviews";
import { formatReward } from "@/lib/challenge-schemas";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { CHALLENGE_SCORE_MAX } from "@/lib/v2/types";
import { ChallengeStatusPill } from "../../challenge-status";
import { StatusButtons } from "../../status-buttons";
import { PlacementBadge, ScoreText } from "./score";

export const metadata: Metadata = { title: "Submissions · Venture Path" };

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default async function ChallengeSubmissionsPage({
  params,
}: PageProps<"/organisation/challenges/[id]/submissions">) {
  const session = await requireRole("organisation");
  const { id } = await params;
  const data = await listChallengeSubmissions(session.user.id, id);
  if (!data) notFound();
  const { challenge, submissions } = data;

  return (
    <RoleHome
      title={challenge.title}
      name={session.user.name}
      back={{ href: "/organisation/challenges", label: "All challenges" }}
      description={`${formatReward(challenge)} · Deadline ${formatIndiaDateTime(challenge.deadline)}`}
      actions={<StatusButtons id={challenge.id} status={challenge.status} />}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 text-[14px] text-[#525252]">
        <ChallengeStatusPill status={challenge.status} />
        <span>
          {challenge.status === "open" &&
            "Students can still submit or edit. You can pick a winner once submissions close."}
          {challenge.status === "judging" &&
            "Submissions are closed. Open a solution to pick the winner, then close the challenge."}
          {challenge.status === "done" && "This challenge is closed."}
        </span>
      </div>

      <section
        aria-label="Submissions"
        className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0f0] px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-[#121212]">
            {submissions.length} submission{submissions.length === 1 ? "" : "s"}
          </h2>
          <p className="inline-flex items-center gap-1.5 text-[12px] text-[#737373]">
            <Info aria-hidden className="size-3.5" />
            Sorted by AI score. AI only sorts and explains; you decide.
          </p>
        </div>
        {submissions.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-[#737373]">No submissions yet.</p>
        ) : (
          <ol>
            {submissions.map((submission, index) => (
              <li key={submission.id} className="border-b border-[#f0f0f0] last:border-b-0">
                <Link
                  href={`/organisation/challenges/${challenge.id}/submissions/${submission.id}`}
                  className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#fafafa]"
                >
                  <span className="mt-0.5 w-5 shrink-0 text-right text-[13px] font-medium text-[#a3a3a3] tabular-nums">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-[#121212]">
                        {submission.userProfile.user.name}
                      </span>
                      <ScoreText
                        score={submission.aiScore}
                        status={submission.aiScoreStatus}
                        max={CHALLENGE_SCORE_MAX}
                      />
                      <PlacementBadge placement={submission.placement} />
                      {submission.similar && (
                        <span className="rounded-full bg-[#fffbeb] px-2 py-0.5 text-[12px] font-medium text-[#b45309]">
                          Looks very similar to another submission
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] text-[#737373]">
                      {submission.userProfile.institution} · Submitted{" "}
                      {formatDate(submission.updatedAt)}
                    </span>
                    {submission.aiReason && (
                      <span className="text-[13px] text-[#525252]">{submission.aiReason}</span>
                    )}
                    {submission.aiQuote ? (
                      <span className="border-l-2 border-[#e5e5e5] pl-2 text-[13px] text-[#737373] italic">
                        “{submission.aiQuote}”
                      </span>
                    ) : (
                      <span className="line-clamp-2 text-[13px] text-[#737373]">
                        {submission.text}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-[#d4d4d4] transition-colors group-hover:text-[#121212]"
                  />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </RoleHome>
  );
}
