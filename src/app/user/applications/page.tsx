import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listUserApplications } from "@/lib/applications";
import { requireRole } from "@/lib/authz";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { STAGE_KIND_LABELS } from "@/lib/hiring/types";
import { formatStartDate, formatStipend } from "@/lib/offer-schemas";
import { listUpcomingEventsForCandidate, type CandidateEventView } from "@/lib/scheduling";
import { studentStatus, type StudentStatus } from "@/lib/student-application-status";
import { withdrawAction } from "@/app/opportunities/[id]/actions";
import { OfferAnswer } from "./offer-answer";

export const metadata: Metadata = { title: "Your applications · Venture Path" };

const STATUS_STYLE: Record<StudentStatus["kind"], string> = {
  applied: "bg-[#f5f5f5] text-[#262626]",
  ai_interview: "bg-[#e8f0fb] text-[#1d4f8f]",
  stage: "bg-[#e8f0fb] text-[#1d4f8f]",
  offer: "bg-[#e6f9ef] text-[#00803f]",
  offer_declined: "bg-[#f5f5f5] text-[#737373]",
  hired: "bg-[#e6f9ef] text-[#00803f]",
  not_selected: "bg-[#f5f5f5] text-[#737373]",
  withdrawn: "bg-[#f5f5f5] text-[#737373]",
};

const AI_INTERVIEW_TEXT = {
  invited:
    "Your AI interview is ready: about 15 minutes, one attempt. Start it here or from the link we emailed you.",
  in_progress: "You started the AI interview. Continue where you left off.",
  completed: "Interview done. The business will get back to you.",
  expired: "The interview link has expired. Contact the business if you still want to take it.",
} as const;

function ScheduledEvent({ event }: { event: CandidateEventView }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-[#f5f5f5] p-3">
      <p className="font-medium">
        {event.stageName} ({STAGE_KIND_LABELS[event.stageKind]}) ·{" "}
        {formatIndiaDateTime(event.startsAt)} · {event.durationMinutes} min
      </p>
      {event.meetUrl && (
        <a href={event.meetUrl} className="w-fit underline">
          Join Google Meet
        </a>
      )}
      {event.instructions && <p className="whitespace-pre-line">{event.instructions}</p>}
      {event.externalUrl && (
        <a href={event.externalUrl} className="underline break-all">
          {event.externalUrl}
        </a>
      )}
    </div>
  );
}

export default async function UserApplicationsPage() {
  const session = await requireRole("user");
  const [applications, events] = await Promise.all([
    listUserApplications(session.user.id),
    listUpcomingEventsForCandidate(session.user.id),
  ]);
  const eventsByApplication = new Map<string, CandidateEventView[]>();
  for (const event of events) {
    const list = eventsByApplication.get(event.applicationId) ?? [];
    list.push(event);
    eventsByApplication.set(event.applicationId, list);
  }
  const now = new Date();

  return (
    <RoleHome title="Your applications" name={session.user.name}>
      {applications.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You have not applied yet.{" "}
          <Link href="/opportunities" className="underline">
            Browse opportunities
          </Link>
        </p>
      )}
      {applications.map((application) => {
        const interview = application.interviewSessions[0];
        const status = studentStatus({
          status: application.status,
          offerStatus: application.offerStatus,
          currentStage: application.currentStage,
          currentStageId: application.currentStageId,
          interview: interview
            ? {
                stageId: interview.stageId,
                status:
                  interview.status === "invited" && interview.expiresAt < now
                    ? "expired"
                    : interview.status,
              }
            : null,
        });
        const business = application.opportunity.organisationProfile.businessName;
        const applicationEvents = eventsByApplication.get(application.id) ?? [];
        return (
          <Card key={application.id} aria-label={application.opportunity.title}>
            <CardHeader>
              <CardTitle>{application.opportunity.title}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span>{business}</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status.kind]}`}
                >
                  {status.kind === "ai_interview" ? `AI interview · ${status.label}` : status.label}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {status.kind === "applied" && (
                <p className="text-[#737373]">Waiting for {business} to review your application.</p>
              )}
              {status.kind === "ai_interview" && (
                <div className="flex flex-col gap-2">
                  <p>{AI_INTERVIEW_TEXT[status.interview]}</p>
                  {(status.interview === "invited" || status.interview === "in_progress") && (
                    // POST: it issues a fresh private link (the emailed one stops working).
                    <form method="post" action={`/interview/open/${application.id}`}>
                      <button type="submit" className={buttonVariants({ className: "w-fit" })}>
                        {status.interview === "invited" ? "Start interview" : "Continue interview"}
                      </button>
                    </form>
                  )}
                </div>
              )}
              {status.kind === "offer" && (
                <section
                  aria-label="Your offer"
                  className="flex flex-col gap-2 rounded-xl border border-[#b8efd2] bg-[#f2fcf6] p-4"
                >
                  <p className="text-base font-medium text-[#00803f]">
                    🎉 {business} is offering you this role
                  </p>
                  {application.offerMessage && (
                    <p className="whitespace-pre-line break-words">{application.offerMessage}</p>
                  )}
                  {formatStipend(application.offerStipendInr) && (
                    <p>
                      <span className="font-medium">Stipend:</span>{" "}
                      {formatStipend(application.offerStipendInr)}
                    </p>
                  )}
                  {formatStartDate(application.offerStartDate) && (
                    <p>
                      <span className="font-medium">Start date:</span>{" "}
                      {formatStartDate(application.offerStartDate)}
                    </p>
                  )}
                  <OfferAnswer applicationId={application.id} business={business} />
                </section>
              )}
              {status.kind === "offer_declined" && (
                <p className="text-[#737373]">You declined {business}&apos;s offer.</p>
              )}
              {status.kind === "hired" && (
                <p>
                  You&apos;re hired! Contact {business} at{" "}
                  {application.opportunity.organisationProfile.user.email}
                </p>
              )}
              {status.kind === "not_selected" && (
                <div className="flex flex-col gap-1">
                  <p className="text-[#737373]">
                    {business} went with someone else this time. Keep adding proof and applying.
                  </p>
                  {application.notSelectedReason && (
                    <p className="rounded-lg bg-[#f5f5f5] p-3 whitespace-pre-line break-words">
                      {application.notSelectedReason}
                    </p>
                  )}
                </div>
              )}
              {applicationEvents.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-[#737373]">Live interview</p>
                  {applicationEvents.map((event) => (
                    <ScheduledEvent key={event.id} event={event} />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-4">
                <Link href={`/opportunities/${application.opportunity.id}`} className="underline">
                  View listing
                </Link>
                {application.status === "submitted" && application.offerStatus !== "pending" && (
                  <form action={withdrawAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <button type="submit" className="underline">
                      Withdraw
                    </button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </RoleHome>
  );
}
