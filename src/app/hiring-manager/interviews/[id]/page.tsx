import { Clock, Download, ExternalLink, Users, Video } from "lucide-react";
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

export const metadata: Metadata = { title: "Interview · Venture Path" };

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
    <RoleHome
      title={event.candidateName}
      name={session.user.name}
      description={`${event.listingTitle} · ${STAGE_KIND_LABELS[event.stageKind]} · ${event.stageName}`}
      back={{ href: "/hiring-manager/interviews", label: "Interviews" }}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DashboardSection title="Candidate">
            <div className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[15px] font-semibold text-white"
              >
                {event.candidateName.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-[#121212]">
                  {event.candidateName}
                </p>
                <p className="text-[13px] text-[#737373]">
                  {event.candidateCourse}, {event.candidateInstitution}
                </p>
              </div>
              {event.resumeFileName && (
                <a
                  href={`/api/applications/${event.applicationId}/resume`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download data-icon="inline-start" />
                  Download resume ({event.resumeFileName})
                </a>
              )}
            </div>
          </DashboardSection>

          <DashboardSection title="Screening answers">
            {event.screeningAnswers.length > 0 ? (
              <ol className="-my-1 flex flex-col divide-y divide-[#f0f0f0] text-[14px]">
                {event.screeningAnswers.map((answer, index) => (
                  <li key={answer.prompt} className="flex min-w-0 gap-3 py-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] text-[12px] font-medium text-[#525252] tabular-nums">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-[#121212]">{answer.prompt}</p>
                      <p className="mt-1 leading-relaxed whitespace-pre-wrap text-[#525252]">
                        {answer.answer}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[14px] text-[#737373]">This listing has no screening questions.</p>
            )}
          </DashboardSection>

          <DashboardSection title="Listing">
            <div className="flex flex-col gap-3 text-[14px]">
              <p className="font-medium text-[#121212]">{event.listingTitle}</p>
              <p className="leading-relaxed whitespace-pre-wrap text-[#525252]">
                {event.listingDescription}
              </p>
              {event.listingRequirements && (
                <div>
                  <p className="text-[12px] font-medium tracking-wide text-[#737373] uppercase">
                    Requirements
                  </p>
                  <p className="mt-1 leading-relaxed whitespace-pre-wrap text-[#525252]">
                    {event.listingRequirements}
                  </p>
                </div>
              )}
              {event.listingSkills.length > 0 && (
                <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
                  {event.listingSkills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-md border border-[#e5e5e5] px-2 py-0.5 text-[12px] text-[#404040]"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DashboardSection>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
          <section
            aria-label="Interview"
            className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
          >
            <div className="flex flex-col gap-1 p-5">
              <p className="text-[12px] font-medium text-[#737373]">
                {SCHEDULE_STATUS_LABELS[event.status]}
              </p>
              <p className="text-[17px] font-semibold text-[#121212]">
                {formatIndiaDateTime(event.startsAt)}
              </p>
              <p className="inline-flex items-center gap-1.5 text-[13px] text-[#737373]">
                <Clock aria-hidden className="size-3.5" />
                {event.durationMinutes} min
              </p>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#f0f0f0] px-5 py-4 text-[13px]">
              {event.meetUrl ? (
                <a
                  href={event.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ className: "w-full" })}
                >
                  <Video data-icon="inline-start" />
                  Join Meet
                </a>
              ) : (
                <p className="text-[#737373]">Meet link: -</p>
              )}
              {event.stageInstructions && (
                <p className="leading-relaxed text-[#525252]">{event.stageInstructions}</p>
              )}
              {event.stageExternalUrl && (
                <a
                  href={event.stageExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 break-all text-[#15803d] hover:underline"
                >
                  <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                  {event.stageExternalUrl}
                </a>
              )}
              <p className="inline-flex items-start gap-1.5 text-[#737373]">
                <Users aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {event.otherInterviewers.length > 0
                  ? `Also interviewing: ${event.otherInterviewers.join(", ")}`
                  : "No other interviewers assigned."}
              </p>
            </div>
          </section>

          <DashboardSection title={event.myFeedback ? "Your feedback" : "Submit feedback"}>
            <FeedbackForm
              eventId={event.id}
              disabledReason={disabledReason}
              initial={event.myFeedback}
            />
          </DashboardSection>
        </div>
      </div>
    </RoleHome>
  );
}
