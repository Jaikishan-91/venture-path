import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveHiringManager } from "@/lib/authz";
import { feedbackDisabledReason, getAssignedEvent } from "@/lib/hm-interviews";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { SCHEDULE_STATUS_LABELS, STAGE_KIND_LABELS } from "@/lib/hiring/types";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Interview · VenturePath" };

export default async function HiringManagerInterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, membership } = await requireActiveHiringManager();
  const { id } = await params;
  const event = await getAssignedEvent(session.user.id, membership.organisationProfileId, id);
  if (!event) notFound();

  const disabledReason = feedbackDisabledReason(event);

  return (
    <RoleHome title={event.candidateName} name={session.user.name}>
      <DashboardSection title="Interview">
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-[#1b2a26]">
            <span className="font-medium">{formatIndiaDateTime(event.startsAt)}</span> ·{" "}
            {event.durationMinutes} min · {SCHEDULE_STATUS_LABELS[event.status]}
          </p>
          <p className="text-[#4a4d53]">
            {STAGE_KIND_LABELS[event.stageKind]} · {event.stageName}
          </p>
          {event.meetUrl ? (
            <a
              href={event.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ className: "self-start" })}
            >
              Join Meet
            </a>
          ) : (
            <p className="text-[#4a4d53]">Meet link: -</p>
          )}
          {event.stageInstructions && <p className="text-[#4a4d53]">{event.stageInstructions}</p>}
          {event.stageExternalUrl && (
            <a
              href={event.stageExternalUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-[#26594a] underline underline-offset-4"
            >
              {event.stageExternalUrl}
            </a>
          )}
          <p className="text-[#4a4d53]">
            {event.otherInterviewers.length > 0
              ? `Also interviewing: ${event.otherInterviewers.join(", ")}`
              : "No other interviewers assigned."}
          </p>
        </div>
      </DashboardSection>

      <DashboardSection title="Listing">
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium text-[#1b2a26]">{event.listingTitle}</p>
          <p className="whitespace-pre-wrap text-[#4a4d53]">{event.listingDescription}</p>
          {event.listingRequirements && (
            <p className="whitespace-pre-wrap text-[#4a4d53]">{event.listingRequirements}</p>
          )}
          {event.listingSkills.length > 0 && (
            <ul aria-label="Skills" className="flex flex-wrap gap-2">
              {event.listingSkills.map((skill) => (
                <li key={skill} className="rounded-md bg-[#f0f1f3] px-2 py-0.5 text-[#1b2a26]">
                  {skill}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DashboardSection>

      <DashboardSection title="Candidate">
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium text-[#1b2a26]">{event.candidateName}</p>
          <p className="text-[#4a4d53]">
            {event.candidateCourse}, {event.candidateInstitution}
          </p>
          <a
            href={`/api/applications/${event.applicationId}/resume`}
            className={buttonVariants({ variant: "outline", className: "self-start" })}
          >
            Download resume ({event.resumeFileName})
          </a>
        </div>
      </DashboardSection>

      <DashboardSection title="Screening answers">
        {event.screeningAnswers.length > 0 ? (
          <ul className="flex flex-col gap-3 text-sm">
            {event.screeningAnswers.map((answer) => (
              <li key={answer.prompt} className="min-w-0 rounded-xl bg-[#f7f7f9] p-3">
                <p className="font-medium text-[#1b2a26]">{answer.prompt}</p>
                <p className="mt-1 whitespace-pre-wrap text-[#4a4d53]">{answer.answer}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#4a4d53]">This listing has no screening questions.</p>
        )}
      </DashboardSection>

      <DashboardSection title={event.myFeedback ? "Your feedback" : "Submit feedback"}>
        <FeedbackForm
          eventId={event.id}
          disabledReason={disabledReason}
          initial={event.myFeedback}
        />
      </DashboardSection>
    </RoleHome>
  );
}
