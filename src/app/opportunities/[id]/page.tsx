import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFrame } from "@/components/public-frame";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOwnApplication } from "@/lib/applications";
import { getSession } from "@/lib/authz";
import { EXPERIENCE_LEVEL_LABELS, WORK_MODE_LABELS, formatPay, isDeadlinePassed } from "@/lib/opportunity-schemas";
import { getStudentProfile } from "@/lib/profiles";
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
    title: opportunity ? `${opportunity.title} · VenturePath` : "Opportunity · VenturePath",
  };
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const opportunity = await getVisibleOpportunity((await params).id);
  if (!opportunity) notFound();
  const business = opportunity.msmeProfile;
  const session = await getSession();
  const application =
    session?.user.role === "student"
      ? await getOwnApplication(session.user.id, opportunity.id)
      : null;
  const profile =
    session?.user.role === "student" && !application
      ? await getStudentProfile(session.user.id)
      : null;

  return (
    <PublicFrame>
    <main className="grid gap-8 px-6 py-8 md:grid-cols-[minmax(0,1fr)_320px] md:px-8">
      <div className="flex flex-col gap-6">
      <Link href="/opportunities" className="text-sm text-[#26594a] underline">
        All opportunities
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-medium tracking-tight text-[#26594a]">{opportunity.title}</h1>
        <p className="text-sm text-muted-foreground">
          {opportunity.type === "internship" ? "Internship" : "Freelance"} ·{" "}
          {formatPay(opportunity)} · {WORK_MODE_LABELS[opportunity.workMode]}
          {opportunity.city && `, ${opportunity.city}`}
          {opportunity.duration && ` · ${opportunity.duration}`}
        </p>
      </header>

      {opportunity.deadline && (
        <p className="text-sm text-muted-foreground">
          Apply by{" "}
          {opportunity.deadline.toLocaleDateString("en-IN", {
            dateStyle: "medium",
            timeZone: "UTC",
          })}
          {isDeadlinePassed(opportunity.deadline) && " · Deadline passed"}
        </p>
      )}
      {opportunity.skills.length > 0 && (
        <ul aria-label="Skills" className="flex flex-wrap gap-2 text-sm">
          {opportunity.skills.map((skill) => (
            <li key={skill} className="rounded-md bg-muted px-2 py-0.5">
              {skill}
            </li>
          ))}
        </ul>
      )}
      <p className="whitespace-pre-line text-sm">{opportunity.description}</p>

      {opportunity.requirements && (
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Requirements</h2>
          <p className="whitespace-pre-line text-sm">{opportunity.requirements}</p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        {opportunity.experienceLevel && (
          <p>
            <span className="font-medium">Experience level:</span>{" "}
            {EXPERIENCE_LEVEL_LABELS[opportunity.experienceLevel]}
          </p>
        )}
        {(opportunity.compensationMin || opportunity.compensationMax) && (
          <p>
            <span className="font-medium">Compensation range:</span>{" "}
            {opportunity.compensationMin
              ? new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(opportunity.compensationMin)
              : "—"}
            {" – "}
            {opportunity.compensationMax
              ? new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(opportunity.compensationMax)
              : "—"}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{business.businessName}</CardTitle>
          <CardDescription>
            {business.industry} · {business.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="whitespace-pre-line">{business.description}</p>
          {business.website && (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="break-all underline"
            >
              {business.website}
            </a>
          )}
        </CardContent>
      </Card>
      </div>

      <section className="flex h-fit flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-[#e2e5e7] md:sticky md:top-6">
        <h2 className="text-lg font-medium">Apply</h2>
        {!session && (
          <Link href="/sign-in" className={buttonVariants({ className: "self-start" })}>
            Sign in to apply
          </Link>
        )}
        {session && session.user.role !== "student" && (
          <p className="text-sm text-muted-foreground">Only students can apply.</p>
        )}
        {session?.user.role === "student" && !application && !profile && (
          <Link href="/student/profile" className={buttonVariants({ className: "self-start" })}>
            Create your profile to apply
          </Link>
        )}
        {session?.user.role === "student" && !application && profile && (
          <ApplyForm opportunityId={opportunity.id} />
        )}
        {application?.status === "withdrawn" && <ApplyForm opportunityId={opportunity.id} />}
        {application && application.status !== "withdrawn" && (
          <p className="text-sm">
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
          <p className="text-sm">
            Contact {business.businessName}: {business.user.email}
          </p>
        )}
        {application?.status === "submitted" && (
          <form action={withdrawAction}>
            <input type="hidden" name="applicationId" value={application.id} />
            <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Withdraw application
            </button>
          </form>
        )}
      </section>
    </main>
    </PublicFrame>
  );
}
