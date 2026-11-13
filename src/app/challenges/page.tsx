import type { Metadata } from "next";
import Link from "next/link";
import { PublicFrame } from "@/components/public-frame";
import { getSession } from "@/lib/authz";
import { daysLeftLabel, formatReward, studentResultLabel } from "@/lib/challenge-schemas";
import { listOpenChallenges, listOwnSubmissions } from "@/lib/challenges";

export const metadata: Metadata = { title: "Challenges · Venture Path" };

const listClass =
  "flex flex-col overflow-hidden rounded-2xl bg-white border border-[#e5e5e5] shadow-card";
const rowClass =
  "flex flex-col gap-1 border-b border-[#e5e5e5] px-5 py-4 transition-colors duration-300 last:border-b-0 hover:bg-[#f5f5f5]";

export default async function ChallengesPage() {
  const session = await getSession();
  const [challenges, mine] = await Promise.all([
    listOpenChallenges(),
    session?.user.role === "user" ? listOwnSubmissions(session.user.id) : Promise.resolve(null),
  ]);

  return (
    <PublicFrame>
      <main className="flex flex-col gap-6 px-4 py-10 md:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-[26px] leading-[1.15] font-medium tracking-tight text-[#121212] lg:text-[32px]">
            Challenges
          </h1>
          <p className="text-sm text-muted-foreground">
            Real problems from local businesses. Send your solution; the best one wins money or a
            job.
          </p>
        </header>

        {mine && mine.length > 0 && (
          <section aria-label="Your submissions" className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Your submissions</h2>
            <div className={listClass}>
              {mine.map((submission) => {
                const result = studentResultLabel(
                  submission.challenge.status,
                  submission.placement,
                );
                return (
                  <Link
                    key={submission.id}
                    href={`/challenges/${submission.challenge.id}`}
                    className={rowClass}
                  >
                    <span className="font-heading text-[16px] font-medium text-[#121212]">
                      {submission.challenge.title}
                    </span>
                    <span className="text-sm text-[#737373]">
                      {submission.challenge.organisationProfile.businessName} ·{" "}
                      {result ??
                        `Submitted · ${daysLeftLabel(submission.challenge.deadline)} to edit`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section aria-label="Open challenges" className="flex flex-col gap-3">
          {mine && mine.length > 0 && <h2 className="text-lg font-medium">Open challenges</h2>}
          {challenges.length === 0 && (
            <p className="text-sm text-muted-foreground">No open challenges right now.</p>
          )}
          {challenges.length > 0 && (
            <div className={listClass}>
              {challenges.map((challenge) => (
                <Link key={challenge.id} href={`/challenges/${challenge.id}`} className={rowClass}>
                  <span className="font-heading text-[16px] font-medium text-[#121212]">
                    {challenge.title}
                  </span>
                  <span className="text-sm text-[#737373]">
                    {challenge.organisationProfile.businessName} · {formatReward(challenge)} ·{" "}
                    {daysLeftLabel(challenge.deadline)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </PublicFrame>
  );
}
