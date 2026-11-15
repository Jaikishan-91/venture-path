import { CalendarDays, Clock, ExternalLink, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PublicFrame } from "@/components/public-frame";
import { buttonVariants } from "@/components/ui/button";
import { getOwnApplication } from "@/lib/applications";
import { getSession } from "@/lib/authz";
import {
  EXPERIENCE_LEVEL_LABELS,
  WORK_MODE_LABELS,
  formatPay,
  isDeadlinePassed,
} from "@/lib/opportunity-schemas";
import { listQuestions } from "@/lib/opportunities";
import { getUserProfile } from "@/lib/profiles";
import { listOwnProofs } from "@/lib/proofs";
import { listResumes, MAX_LIBRARY_RESUMES } from "@/lib/resume-library";
import { isRole } from "@/lib/roles";
import { getVisibleOpportunity } from "@/lib/search";
import { withdrawAction } from "./actions";
import { ApplyForm } from "./apply-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const opportunity = await getVisibleOpportunity((await params).id);
  return {
    title: opportunity ? `${opportunity.title} · Venture Path` : "Opportunity · Venture Path",
  };
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-[#f0f0f0] px-5 py-5 first:border-t-0 md:px-6">
      <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-[#737373]">{label}</dt>
      <dd className="text-right text-[14px] font-medium text-[#121212]">{children}</dd>
    </div>
  );
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const opportunity = await getVisibleOpportunity((await params).id);
  if (!opportunity) notFound();
  const business = opportunity.organisationProfile;
  const session = await getSession();
  const inApp = Boolean(session && isRole(session.user.role));
  const application =
    session?.user.role === "user" ? await getOwnApplication(session.user.id, opportunity.id) : null;
  const profile =
    session?.user.role === "user" && !application ? await getUserProfile(session.user.id) : null;
  const canApply = (profile !== null && !application) || application?.status === "withdrawn";
  const [questions, resumes, proofs] = canApply
    ? await Promise.all([
        listQuestions(opportunity.id),
        listResumes(session!.user.id),
        listOwnProofs(session!.user.id),
      ])
    : [[], [], []];
  const applyForm = (
    <ApplyForm
      opportunityId={opportunity.id}
      questions={questions}
      resumes={resumes.map((resume) => ({ id: resume.id, fileName: resume.fileName }))}
      canUpload={resumes.length < MAX_LIBRARY_RESUMES}
      proofs={proofs.map((proof) => ({ id: proof.id, title: proof.title, level: proof.level }))}
      applyTask={opportunity.applyTask}
    />
  );

  const typeLabel = opportunity.type === "internship" ? "Internship" : "Freelance";
  const mode = WORK_MODE_LABELS[opportunity.workMode];
  const deadlinePassed = opportunity.deadline ? isDeadlinePassed(opportunity.deadline) : false;
  const deadline = opportunity.deadline?.toLocaleDateString("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const hasDetails =
    opportunity.experienceLevel || opportunity.compensationMin || opportunity.compensationMax;
  // A tall form (screening questions) can't be sticky: its end would be unreachable.
  const sticky = questions.length === 0 && !opportunity.applyTask;

  return (
    <PublicFrame appShell>
      <main className={`flex flex-col gap-6 ${inApp ? "" : "px-4 py-8 md:px-8 md:py-10"}`}>
        <PageHeader
          back={{ href: "/opportunities", label: "All opportunities" }}
          title={opportunity.title}
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-[#404040]">{business.businessName}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" />
                {mode}
                {opportunity.city && `, ${opportunity.city}`}
              </span>
            </span>
          }
        />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="min-w-0 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
            <div className="flex flex-wrap gap-1.5 border-b border-[#f0f0f0] px-5 py-4 md:px-6">
              <span className="rounded-md bg-[#f5f5f5] px-2 py-1 text-[12px] font-medium text-[#404040]">
                {typeLabel}
              </span>
              <span className="rounded-md bg-[#f0fdf4] px-2 py-1 text-[12px] font-medium text-[#15803d]">
                {formatPay(opportunity)}
              </span>
              {opportunity.duration && (
                <span className="inline-flex items-center gap-1 rounded-md border border-[#e5e5e5] px-2 py-1 text-[12px] text-[#525252]">
                  <Clock aria-hidden className="size-3" />
                  {opportunity.duration}
                </span>
              )}
              {deadline && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] ${
                    deadlinePassed
                      ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
                      : "border-[#e5e5e5] text-[#525252]"
                  }`}
                >
                  <CalendarDays aria-hidden className="size-3" />
                  Apply by {deadline}
                  {deadlinePassed && " · Deadline passed"}
                </span>
              )}
            </div>

            <Section title="About the role">
              <p className="text-[14px] leading-relaxed whitespace-pre-line text-[#404040]">
                {opportunity.description}
              </p>
            </Section>

            {opportunity.skills.length > 0 && (
              <Section title="Skills">
                <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
                  {opportunity.skills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-md border border-[#e5e5e5] px-2 py-1 text-[13px] text-[#404040]"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {opportunity.requirements && (
              <Section title="Requirements">
                <p className="text-[14px] leading-relaxed whitespace-pre-line text-[#404040]">
                  {opportunity.requirements}
                </p>
              </Section>
            )}

            {hasDetails && (
              <Section title="Details">
                <dl className="grid gap-4 sm:grid-cols-2">
                  {opportunity.experienceLevel && (
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[13px] text-[#737373]">Experience level</dt>
                      <dd className="text-[14px] font-medium text-[#121212]">
                        {EXPERIENCE_LEVEL_LABELS[opportunity.experienceLevel]}
                      </dd>
                    </div>
                  )}
                  {(opportunity.compensationMin || opportunity.compensationMax) && (
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[13px] text-[#737373]">Compensation range</dt>
                      <dd className="text-[14px] font-medium text-[#121212] tabular-nums">
                        {opportunity.compensationMin
                          ? inr.format(opportunity.compensationMin)
                          : "—"}
                        {" – "}
                        {opportunity.compensationMax
                          ? inr.format(opportunity.compensationMax)
                          : "—"}
                      </dd>
                    </div>
                  )}
                </dl>
              </Section>
            )}

            <Section title="About the business">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[15px] font-semibold text-[#404040]"
                >
                  {business.businessName.trim().charAt(0).toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-[13px] text-[#737373]">
                    {business.industry} · {business.location}
                  </p>
                  <p className="text-[14px] leading-relaxed whitespace-pre-line text-[#404040]">
                    {business.description}
                  </p>
                  {business.website && (
                    <a
                      href={business.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 self-start text-[13px] font-medium break-all text-[#15803d] hover:underline"
                    >
                      {business.website}
                      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            </Section>
          </article>

          <aside
            className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e5e5e5] bg-white ${
              sticky ? "lg:sticky lg:top-6" : ""
            }`}
          >
            <div className="border-b border-[#f0f0f0] px-5 py-4">
              <p className="text-[13px] text-[#737373]">Pay</p>
              <p className="text-[22px] font-semibold tracking-tight text-[#121212] tabular-nums">
                {formatPay(opportunity)}
              </p>
              <dl className="mt-2 divide-y divide-[#f0f0f0]">
                <Fact label="Type">{typeLabel}</Fact>
                <Fact label="Work mode">{mode}</Fact>
                {opportunity.city && <Fact label="City">{opportunity.city}</Fact>}
                {opportunity.duration && <Fact label="Duration">{opportunity.duration}</Fact>}
                {deadline && <Fact label="Deadline">{deadline}</Fact>}
              </dl>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              <h2 className="text-[15px] font-semibold text-[#121212]">Apply</h2>
              {!session && (
                <>
                  <p className="text-[13px] text-[#737373]">
                    Sign in with your student account to send your proof and apply.
                  </p>
                  <Link href="/sign-in" className={buttonVariants({ className: "w-full" })}>
                    Sign in to apply
                  </Link>
                </>
              )}
              {session && session.user.role !== "user" && (
                <p className="text-[13px] text-[#737373]">Only users can apply.</p>
              )}
              {session?.user.role === "user" && !application && !profile && (
                <>
                  <p className="text-[13px] text-[#737373]">
                    Businesses need to know where you study and what you can do.
                  </p>
                  <Link href="/user/profile" className={buttonVariants({ className: "w-full" })}>
                    Create your profile to apply
                  </Link>
                </>
              )}
              {session?.user.role === "user" && !application && profile && applyForm}
              {application?.status === "withdrawn" && applyForm}
              {application && application.status !== "withdrawn" && (
                <p
                  className={`rounded-lg px-3 py-2.5 text-[13px] ${
                    application.status === "accepted"
                      ? "bg-[#f0fdf4] text-[#15803d]"
                      : application.status === "submitted"
                        ? "bg-[#fffbeb] text-[#92400e]"
                        : "bg-[#f5f5f5] text-[#404040]"
                  }`}
                >
                  Your application is{" "}
                  {application.status === "submitted"
                    ? "waiting for a decision"
                    : application.status === "accepted"
                      ? "accepted"
                      : "not accepted"}
                  .
                </p>
              )}
              {application?.status === "accepted" && (
                <p className="text-[13px] text-[#404040]">
                  Contact the business:{" "}
                  <a
                    href={`mailto:${business.user.email}`}
                    className="font-medium break-all text-[#15803d] hover:underline"
                  >
                    {business.user.email}
                  </a>
                </p>
              )}
              {application?.status === "submitted" && (
                <form action={withdrawAction}>
                  <input type="hidden" name="applicationId" value={application.id} />
                  <button
                    type="submit"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "w-full",
                    })}
                  >
                    Withdraw application
                  </button>
                </form>
              )}
            </div>
          </aside>
        </div>
      </main>
    </PublicFrame>
  );
}
