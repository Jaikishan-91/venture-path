import { CalendarClock, Inbox, Plus, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { daysLeft, daysLeftLabel, formatInr } from "@/lib/challenge-schemas";
import { listOwnChallenges } from "@/lib/challenges";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { getOrganisationProfile } from "@/lib/profiles";
import { ChallengeStatusPill } from "./challenge-status";
import { StatusButtons } from "./status-buttons";

export const metadata: Metadata = { title: "Your challenges · Venture Path" };

export default async function OrganisationChallengesPage() {
  const session = await requireRole("organisation");
  const [profile, challenges] = await Promise.all([
    getOrganisationProfile(session.user.id),
    listOwnChallenges(session.user.id),
  ]);
  const approved = profile?.status === "approved";
  const open = challenges.filter((challenge) => challenge.status === "open").length;

  return (
    <RoleHome
      title="Your challenges"
      name={session.user.name}
      description="Post a real problem from your business with a reward. Students send solutions, AI sorts them, and you pick the winner."
      actions={
        approved ? (
          <Link href="/organisation/challenges/new" className={buttonVariants({ size: "sm" })}>
            <Plus data-icon="inline-start" />
            Post a challenge
          </Link>
        ) : null
      }
    >
      {!approved && (
        <p
          role="status"
          className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[14px] text-[#92400e]"
        >
          {profile
            ? "Your business needs admin approval before you can post challenges."
            : "Create your business profile and get it approved to post challenges."}
        </p>
      )}

      {challenges.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#d4d4d4] bg-white px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-[#f5f5f5] text-[#737373]">
            <Trophy aria-hidden className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold text-[#121212]">No challenges yet.</p>
            <p className="max-w-sm text-[14px] text-[#737373]">
              A challenge is a quick way to see who can actually do the work before you hire.
            </p>
          </div>
          {approved && (
            <Link href="/organisation/challenges/new" className={buttonVariants({ size: "sm" })}>
              Post your first challenge
            </Link>
          )}
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-[13px] text-[#737373]">
            {challenges.length} challenge{challenges.length === 1 ? "" : "s"} · {open} open
          </p>
          <ul className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
            {challenges.map((challenge) => {
              const urgent = challenge.status === "open" && daysLeft(challenge.deadline) <= 3;
              const count = challenge._count.submissions;
              return (
                <li key={challenge.id} className="border-b border-[#f0f0f0] last:border-b-0">
                  <article
                    aria-label={challenge.title}
                    className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:gap-6"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 text-[15px] font-semibold break-words text-[#121212]">
                          {challenge.title}
                        </h2>
                        <ChallengeStatusPill status={challenge.status} />
                      </div>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#737373]">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#15803d]">
                          {challenge.rewardMoneyInr !== null
                            ? formatInr(challenge.rewardMoneyInr)
                            : "No cash reward"}
                          {challenge.rewardHire && (
                            <span className="rounded-md border border-[#bbf7d0] px-1.5 py-px text-[11px] font-medium">
                              Hiring
                            </span>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock aria-hidden className="size-3.5" />
                          Deadline {formatIndiaDateTime(challenge.deadline)}
                        </span>
                        {challenge.status === "open" && (
                          <span className={urgent ? "font-medium text-[#b45309]" : undefined}>
                            {daysLeftLabel(challenge.deadline)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Inbox aria-hidden className="size-3.5" />
                          {count} submission{count === 1 ? "" : "s"}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {challenge.status !== "draft" && (
                        <Link
                          href={`/organisation/challenges/${challenge.id}/submissions`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Submissions
                        </Link>
                      )}
                      {approved &&
                        (challenge.status === "draft" || challenge.status === "open") && (
                          <Link
                            href={`/organisation/challenges/${challenge.id}/edit`}
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                          >
                            Edit
                          </Link>
                        )}
                      <StatusButtons id={challenge.id} status={challenge.status} />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </RoleHome>
  );
}
