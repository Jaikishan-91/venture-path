import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFrame } from "@/components/public-frame";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/authz";
import { daysLeftLabel, formatReward, studentResultLabel } from "@/lib/challenge-schemas";
import { getOwnSubmission, getVisibleChallenge } from "@/lib/challenges";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { getUserProfile } from "@/lib/profiles";
import { SubmitForm } from "./submit-form";

export async function generateMetadata({
  params,
}: PageProps<"/challenges/[id]">): Promise<Metadata> {
  const challenge = await getVisibleChallenge((await params).id);
  return { title: challenge ? `${challenge.title} · VenturePath` : "Challenge · VenturePath" };
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

  return (
    <PublicFrame>
      <main className="grid gap-8 px-6 py-8 md:grid-cols-[minmax(0,1fr)_360px] md:px-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Link href="/challenges" className="text-sm text-[#26594a] underline">
            All challenges
          </Link>
          <header className="flex flex-col gap-1">
            <h1 className="text-3xl font-medium tracking-tight text-[#26594a]">
              {challenge.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {business.businessName} · {business.location}
            </p>
          </header>
          <dl className="grid gap-3 rounded-2xl bg-white p-5 text-sm ring-1 ring-[#e2e5e7] sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Reward</dt>
              <dd className="text-lg font-medium">{formatReward(challenge)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Deadline</dt>
              <dd>
                {formatIndiaDateTime(challenge.deadline)}
                {open && ` · ${daysLeftLabel(challenge.deadline)}`}
              </dd>
            </div>
          </dl>
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">The problem</h2>
            <p className="whitespace-pre-line break-words text-sm">{challenge.problem}</p>
          </section>
          {challenge.goodSolution && (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">What a good solution looks like</h2>
              <p className="whitespace-pre-line break-words text-sm">{challenge.goodSolution}</p>
            </section>
          )}
          {challenge.criteria.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">How solutions are judged</h2>
              <ul className="list-disc pl-5 text-sm">
                {challenge.criteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </section>
          )}
          {challenge.fileName && (
            <a href={`/api/challenges/${challenge.id}/file`} className="text-sm underline">
              Download {challenge.fileName}
            </a>
          )}
        </div>

        <section className="flex h-fit min-w-0 flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-[#e2e5e7]">
          <h2 className="text-lg font-medium">
            {submission ? "Your solution" : "Submit solution"}
          </h2>
          {result && (
            <p className="text-sm">
              Result: <span className="font-medium">{result}</span>
            </p>
          )}
          {!open && !submission && (
            <p className="text-sm text-muted-foreground">
              This challenge is no longer taking solutions.
            </p>
          )}
          {open && !session && (
            <Link href="/sign-in" className={buttonVariants({ className: "self-start" })}>
              Sign in to submit
            </Link>
          )}
          {open && session && !isUser && (
            <p className="text-sm text-muted-foreground">Only students can submit solutions.</p>
          )}
          {open && isUser && !profile && (
            <Link href="/user/profile" className={buttonVariants({ className: "self-start" })}>
              Create your profile to submit
            </Link>
          )}
          {open && isUser && profile && (
            <>
              {submission && (
                <p className="text-xs text-muted-foreground">
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
            <div className="flex flex-col gap-2 text-sm">
              <p className="line-clamp-6 whitespace-pre-line break-words text-muted-foreground">
                {submission.text}
              </p>
              {submission.fileName && (
                <a href={`/api/challenge-submissions/${submission.id}/file`} className="underline">
                  {submission.fileName}
                </a>
              )}
            </div>
          )}
        </section>
      </main>
    </PublicFrame>
  );
}
