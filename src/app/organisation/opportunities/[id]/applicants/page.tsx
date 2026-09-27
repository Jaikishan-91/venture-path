import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isFiltered, parseApplicantFilters } from "@/lib/applicant-filters";
import { listApplicants } from "@/lib/applications";
import { requireRole } from "@/lib/authz";
import { getOwnOpportunity } from "@/lib/opportunities";
import { getOrderedStages } from "@/lib/pipelines";
import { listInterviewerOptions } from "@/lib/team";
import { listFeedbackForApplications, type FeedbackView } from "@/lib/interview-feedback";
import { listEventsForApplications, type ScheduledEventView } from "@/lib/scheduling";
import { createLlmClient } from "@/lib/llm/provider";
import { decideAction } from "./actions";
import { ApplicantFilters } from "./applicant-filters";
import { PipelinePanel } from "./pipeline-panel";
import { ResumeAnalysis } from "./resume-analysis";

export const metadata: Metadata = { title: "Applicants · VenturePath" };

const STATUS_LABEL = {
  submitted: "Waiting",
  accepted: "Accepted",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};

const formatApplied = (date: Date) =>
  date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("organisation");
  const { id } = await params;
  const opportunity = await getOwnOpportunity(session.user.id, id);
  if (!opportunity) notFound();
  const filters = parseApplicantFilters(await searchParams);
  const [{ applicants, unscored }, stages, interviewerOptions] = await Promise.all([
    listApplicants(session.user.id, id, filters),
    getOrderedStages(id),
    listInterviewerOptions(session.user.id),
  ]);
  const hasPipeline = stages.length > 0;
  const applicationIds = applicants.map((application) => application.id);
  const [eventsByApplication, feedbackByApplication]: [
    Map<string, ScheduledEventView[]>,
    Record<string, FeedbackView[]>,
  ] = hasPipeline
    ? await Promise.all([
        listEventsForApplications(session.user.id, applicationIds),
        listFeedbackForApplications(session.user.id, applicationIds),
      ])
    : [new Map(), {}];
  const canReanalyze = createLlmClient() !== null;
  const basePath = `/organisation/opportunities/${id}/applicants`;

  return (
    <RoleHome title={opportunity.title} name={session.user.name}>
      <Link href="/organisation/opportunities" className="text-sm underline">
        Your listings
      </Link>
      {opportunity._count.applications > 0 && (
        <ApplicantFilters
          filters={filters}
          basePath={basePath}
          stages={stages.map((stage) => ({ id: stage.id, name: stage.name }))}
        />
      )}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {opportunity._count.applications === 0
          ? "No applications yet."
          : isFiltered(filters)
            ? `${applicants.length} of ${opportunity._count.applications} applicants match.`
            : `${applicants.length} ${applicants.length === 1 ? "applicant" : "applicants"}.`}
        {unscored > 0 &&
          ` ${unscored} not yet scored ${unscored === 1 ? "is" : "are"} hidden by the score filter.`}
      </p>
      {applicants.map((application) => (
        <article
          key={application.id}
          aria-label={application.userProfile.user.name}
          className="flex flex-col gap-3"
        >
          <Card>
            <CardHeader>
              <CardTitle>{application.userProfile.user.name}</CardTitle>
              <CardDescription>
                {application.userProfile.course}, {application.userProfile.institution} ·{" "}
                {STATUS_LABEL[application.status]} · Applied {formatApplied(application.appliedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {application.userProfile.skills.length > 0 && (
                <p>{application.userProfile.skills.join(", ")}</p>
              )}
              {application.note && <p className="whitespace-pre-line">{application.note}</p>}
              {application.status === "accepted" && (
                <p>Email: {application.userProfile.user.email}</p>
              )}
              <a href={`/api/applications/${application.id}/resume`} className="underline">
                Download {application.resumeFileName}
              </a>
              {hasPipeline && (
                <PipelinePanel
                  applicationId={application.id}
                  status={application.status}
                  currentStageId={application.currentStageId}
                  stages={stages}
                  events={eventsByApplication.get(application.id) ?? []}
                  feedback={feedbackByApplication[application.id] ?? []}
                  interviewerOptions={interviewerOptions}
                />
              )}
              {application.status === "submitted" && (
                <div className="flex gap-2">
                  <form action={decideAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <input type="hidden" name="decision" value="accepted" />
                    <button type="submit" className={buttonVariants({ size: "sm" })}>
                      Accept
                    </button>
                  </form>
                  <form action={decideAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button
                      type="submit"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>

          <ResumeAnalysis
            applicationId={application.id}
            analysis={application.analysis}
            answers={application.answers}
            canReanalyze={canReanalyze}
          />
        </article>
      ))}
    </RoleHome>
  );
}
