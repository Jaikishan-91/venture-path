import { Briefcase, Clock, Download, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PublicFrame } from "@/components/public-frame";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/authz";
import { daysLeft, daysLeftLabel, formatReward, studentResultLabel } from "@/lib/challenge-schemas";
import { getOwnSubmission, getVisibleChallenge } from "@/lib/challenges";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { getUserProfile } from "@/lib/profiles";
import { isRole } from "@/lib/roles";
import { SubmitForm } from "./submit-form";

/** Three days or fewer left: shown in amber. */
const URGENT_DAYS = 3;

export async function generateMetadata({
  params,
}: PageProps<"/challenges/[id]">): Promise<Metadata> {
  const challenge = await getVisibleChallenge((await params).id);
  return { title: challenge ? `${challenge.title} · Venture Path` : "Challenge · Venture Path" };
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
      <h2 className="border-b border-[#f0f0f0] px-5 py-3.5 text-[15px] font-semibold text-[#121212]">
        {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export default async function ChallengePage({ params }: PageProps<"/challenges/[id]">) {
  const challenge = await getVisibleChallenge((await params).id);
  if (!challenge) notFound();
  const business = challenge.organisationProfile;
  const session = await getSession();
  const isUser = session?.user.role === "user";
  const [submission, profile] = isUser
    ? await Promise.all([
        getOwnSubmission(session.user.id, challenge.id),
        getUserProfile(session.user.id),
      ])
    : [null, null];
  const open = challenge.status === "open";
  const result = submission ? studentResultLabel(challenge.status, submission.placement) : null;
  // Signed-in people get the app shell, which already pads the column.
  const inApp = Boolean(session && isRole(session.user.role));
  const urgent = open && daysLeft(challenge.deadline) <= URGENT_DAYS;
  const hasMoney = challenge.rewardMoneyInr !== null;
  const reward = hasMoney
    ? formatReward({ ...challenge, rewardHire: false })
    : formatReward(challenge);
  const deadlineClass = urgent ? "text-[#b45309]" : "text-[#737373]";

  return (
    <PublicFrame appShell>
      <main className={`flex flex-col gap-6 ${inApp ? "" : "px-4 py-8 md:px-8 md:py-10"}`.trim()}>
        <PageHeader
          back={{ href: "/challenges", label: "All challenges" }}
          title={challenge.title}
          description={`${business.businessName} · ${business.location}`}
        />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* Phones: the key facts before the long text (the side card comes after it). */}
            <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white lg:hidden">
              <div className="border-r border-[#f0f0f0] px-4 py-3">
                <dt className="text-[12px] text-[#737373]">Reward</dt>
                <dd className="truncate text-[15px] font-semibold text-[#15803d]">{reward}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-[12px] text-[#737373]">Deadline</dt>
                <dd
                  className={`text-[14px] font-medium ${open ? deadlineClass : "text-[#737373]"}`}
                >
                  {open ? daysLeftLabel(challenge.deadline) : "Closed"}
                </dd>
              </div>
            </dl>

            <Panel title="The problem">
              <p className="text-[14px] leading-relaxed break-words whitespace-pre-line text-[#404040]">
                {challenge.problem}
              </p>
            </Panel>

            {challenge.goodSolution && (
              <Panel title="What a good solution looks like">
                <p className="text-[14px] leading-relaxed break-words whitespace-pre-line text-[#404040]">
                  {challenge.goodSolution}
                </p>
              </Panel>
            )}

            {challenge.criteria.length > 0 && (
              <Panel title="How solutions are judged">
                <ol className="flex flex-col gap-3">
                  {challenge.criteria.map((criterion, index) => (
                    <li key={criterion} className="flex gap-3 text-[14px] text-[#404040]">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-[#fafafa] text-[12px] font-semibold text-[#404040] tabular-nums">
                        {index + 1}
                      </span>
                      <span className="pt-0.5 leading-relaxed">{criterion}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}

            {challenge.fileName && (
              <a
                href={`/api/challenges/${challenge.id}/file`}
                className="group flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-5 py-3.5 transition-colors hover:bg-[#fafafa]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#525252]">
                  <Download aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 truncate text-[14px] font-medium text-[#121212] group-hover:underline">
                  Download {challenge.fileName}
                </span>
              </a>
            )}
          </div>

          <aside
            className={`flex min-w-0 flex-col gap-4 lg:sticky ${inApp ? "lg:top-6" : "lg:top-24"}`}
          >
            <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
              <dl className="hidden divide-y divide-[#f0f0f0] lg:block">
                <div className="px-5 py-4">
                  <dt className="text-[12px] text-[#737373]">Reward</dt>
                  <dd className="text-[22px] font-semibold tracking-tight text-[#15803d] tabular-nums">
                    {reward}
                  </dd>
                  {hasMoney && challenge.rewardHire && (
                    <dd className="mt-1 inline-flex items-center gap-1 text-[13px] text-[#404040]">
                      <Briefcase aria-hidden className="size-3.5" /> Winner may be hired
                    </dd>
                  )}
                </div>
                <div className="px-5 py-4">
                  <dt className="text-[12px] text-[#737373]">Deadline</dt>
                  <dd className="text-[14px] font-medium text-[#121212]">
                    {formatIndiaDateTime(challenge.deadline)}
                  </dd>
                  {open && (
                    <dd
                      className={`mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium ${deadlineClass}`}
                    >
                      <Clock aria-hidden className="size-3.5" />
                      {daysLeftLabel(challenge.deadline)}
                    </dd>
                  )}
                </div>
              </dl>
              <div className="flex items-center gap-3 border-[#f0f0f0] px-5 py-4 lg:border-t">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[14px] font-semibold text-[#404040]"
                >
                  {business.businessName.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[#121212]">
                    {business.businessName}
                  </p>
                  <p className="flex items-center gap-1 truncate text-[12px] text-[#737373]">
                    <MapPin aria-hidden className="size-3 shrink-0" />
                    {business.industry} · {business.location}
                  </p>
                </div>
              </div>
            </div>

            <section className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white p-5">
              <h2 className="text-[15px] font-semibold text-[#121212]">
                {submission ? "Your solution" : "Submit solution"}
              </h2>
              {result && (
                <p className="rounded-lg bg-[#fafafa] px-3 py-2 text-[14px] text-[#404040]">
                  Result: <span className="font-semibold text-[#121212]">{result}</span>
                </p>
              )}
              {!open && !submission && (
                <p className="text-[14px] text-[#737373]">
                  This challenge is no longer taking solutions.
                </p>
              )}
              {open && !session && (
                <>
                  <p className="text-[13px] text-[#737373]">
                    Sign in with a student account to send your solution.
                  </p>
                  <Link href="/sign-in" className={buttonVariants({ className: "w-full" })}>
                    Sign in to submit
                  </Link>
                </>
              )}
              {open && session && !isUser && (
                <p className="text-[14px] text-[#737373]">Only students can submit solutions.</p>
              )}
              {open && isUser && !profile && (
                <>
                  <p className="text-[13px] text-[#737373]">
                    Businesses see your profile with your solution.
                  </p>
                  <Link href="/user/profile" className={buttonVariants({ className: "w-full" })}>
                    Create your profile to submit
                  </Link>
                </>
              )}
              {open && isUser && profile && (
                <>
                  {submission && (
                    <p className="text-[12px] text-[#737373]">
                      Sent {formatIndiaDateTime(submission.updatedAt)}. You can edit it until the
                      deadline.
                    </p>
                  )}
                  <SubmitForm
                    challengeId={challenge.id}
                    initial={
                      submission
                        ? {
                            text: submission.text,
                            link: submission.link ?? "",
                            fileName: submission.fileName,
                            submissionId: submission.id,
                          }
                        : null
                    }
                  />
                </>
              )}
              {!open && submission && (
                <div className="flex flex-col gap-2 text-[14px]">
                  <p className="line-clamp-6 break-words whitespace-pre-line text-[#525252]">
                    {submission.text}
                  </p>
                  {submission.fileName && (
                    <a
                      href={`/api/challenge-submissions/${submission.id}/file`}
                      className="break-all text-[#121212] underline underline-offset-4"
                    >
                      {submission.fileName}
                    </a>
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>
    </PublicFrame>
  );
}
