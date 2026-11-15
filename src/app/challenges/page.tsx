import { ArrowRight, Briefcase, Clock, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PublicFrame } from "@/components/public-frame";
import { getSession } from "@/lib/authz";
import { daysLeft, daysLeftLabel, formatReward, studentResultLabel } from "@/lib/challenge-schemas";
import { listOpenChallenges, listOwnSubmissions } from "@/lib/challenges";
import { isRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Challenges · Venture Path" };

/** Three days or fewer left: shown in amber. */
const URGENT_DAYS = 3;

function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[14px] font-semibold text-[#404040]"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Winner/runner-up in green, "Not selected" muted, judging in amber. */
function resultClass(result: string | null) {
  if (result === "Winner" || result === "Runner-up") return "bg-[#f0fdf4] text-[#15803d]";
  if (result === "Being judged") return "bg-[#fffbeb] text-[#b45309]";
  if (result === "Not selected") return "bg-[#f5f5f5] text-[#525252]";
  return "bg-[#f5f5f5] text-[#404040]";
}

export default async function ChallengesPage() {
  const session = await getSession();
  const [challenges, mine] = await Promise.all([
    listOpenChallenges(),
    session?.user.role === "user" ? listOwnSubmissions(session.user.id) : Promise.resolve(null),
  ]);
  // Signed-in people get the app shell, which already pads the column.
  const inApp = Boolean(session && isRole(session.user.role));

  return (
    <PublicFrame appShell>
      <main className={`flex flex-col gap-6 ${inApp ? "" : "px-4 py-8 md:px-8 md:py-10"}`.trim()}>
        <PageHeader
          title="Challenges"
          description="Real problems from local businesses. Send your solution; the best one wins money or a job."
        />

        {mine && mine.length > 0 && (
          <section
            aria-label="Your submissions"
            className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#f0f0f0] px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-[#121212]">Your submissions</h2>
              <span className="text-[13px] text-[#737373] tabular-nums">{mine.length}</span>
            </div>
            <ul className="divide-y divide-[#f0f0f0]">
              {mine.map((submission) => {
                const result = studentResultLabel(
                  submission.challenge.status,
                  submission.placement,
                );
                return (
                  <li key={submission.id}>
                    <Link
                      href={`/challenges/${submission.challenge.id}`}
                      className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[#fafafa]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-[#121212] group-hover:underline group-hover:underline-offset-4">
                          {submission.challenge.title}
                        </span>
                        <span className="block truncate text-[13px] text-[#737373]">
                          {submission.challenge.organisationProfile.businessName}
                          {result
                            ? ""
                            : ` · ${daysLeftLabel(submission.challenge.deadline)} to edit`}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium ${resultClass(result)}`}
                      >
                        {result ?? "Submitted"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-label="Open challenges" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-[#121212]">Open challenges</h2>
            {challenges.length > 0 && (
              <span className="text-[13px] text-[#737373] tabular-nums">
                {challenges.length} open
              </span>
            )}
          </div>

          {challenges.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#d4d4d4] bg-white px-6 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#737373]">
                <Trophy aria-hidden className="size-5" />
              </span>
              <p className="text-[14px] font-medium text-[#121212]">
                No open challenges right now.
              </p>
              <p className="max-w-sm text-[13px] text-[#737373]">
                Businesses post new problems every week. Meanwhile, browse open jobs.
              </p>
              <Link
                href="/opportunities"
                className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-[#15803d] hover:underline"
              >
                Explore jobs <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </div>
          )}

          {challenges.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {challenges.map((challenge) => {
                const left = daysLeft(challenge.deadline);
                const urgent = left <= URGENT_DAYS;
                // Money as the headline reward; "Hiring" as its own marker when both are offered.
                const hasMoney = challenge.rewardMoneyInr !== null;
                const reward = hasMoney
                  ? formatReward({ ...challenge, rewardHire: false })
                  : formatReward(challenge);
                return (
                  <li key={challenge.id}>
                    <Link
                      href={`/challenges/${challenge.id}`}
                      className="group flex h-full flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-5 transition-[border-color,box-shadow] duration-200 hover:border-[#a3a3a3] hover:shadow-[0_6px_20px_-12px_rgb(0_0_0/0.2)]"
                    >
                      <div className="flex items-center gap-3">
                        <Initial name={challenge.organisationProfile.businessName} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[#404040]">
                            {challenge.organisationProfile.businessName}
                          </p>
                          <p className="truncate text-[12px] text-[#737373]">
                            {challenge.organisationProfile.industry}
                          </p>
                        </div>
                      </div>
                      <h3 className="text-[16px] leading-snug font-semibold text-[#121212] group-hover:underline group-hover:underline-offset-4">
                        {challenge.title}
                      </h3>
                      <div className="mt-auto flex items-end justify-between gap-3 border-t border-[#f0f0f0] pt-3">
                        <div className="min-w-0">
                          <p className="text-[12px] text-[#737373]">Reward</p>
                          <p className="truncate text-[16px] font-semibold text-[#15803d] tabular-nums">
                            {reward}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 text-[12px]">
                          {hasMoney && challenge.rewardHire && (
                            <span className="inline-flex items-center gap-1 text-[#404040]">
                              <Briefcase aria-hidden className="size-3.5" /> Hiring
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              urgent ? "text-[#b45309]" : "text-[#737373]"
                            }`}
                          >
                            <Clock aria-hidden className="size-3.5" />
                            {daysLeftLabel(challenge.deadline)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </PublicFrame>
  );
}
