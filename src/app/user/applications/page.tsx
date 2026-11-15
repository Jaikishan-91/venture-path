import { CalendarClock, ExternalLink, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
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

const STATUS_STYLE: Record<StudentStatus["kind"], { pill: string; dot: string }> = {
  applied: { pill: "border-[#e5e5e5] bg-white text-[#404040]", dot: "bg-[#a3a3a3]" },
  ai_interview: { pill: "border-[#dbe7f7] bg-[#f3f7fd] text-[#1d4f8f]", dot: "bg-[#3b82f6]" },
  stage: { pill: "border-[#dbe7f7] bg-[#f3f7fd] text-[#1d4f8f]", dot: "bg-[#3b82f6]" },
  offer: { pill: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]", dot: "bg-[#16a34a]" },
  offer_declined: { pill: "border-[#e5e5e5] bg-[#fafafa] text-[#737373]", dot: "bg-[#d4d4d4]" },
  hired: { pill: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]", dot: "bg-[#16a34a]" },
  not_selected: { pill: "border-[#e5e5e5] bg-[#fafafa] text-[#737373]", dot: "bg-[#d4d4d4]" },
  withdrawn: { pill: "border-[#e5e5e5] bg-[#fafafa] text-[#737373]", dot: "bg-[#d4d4d4]" },
};

const CLOSED: StudentStatus["kind"][] = ["offer_declined", "not_selected", "withdrawn"];

const AI_INTERVIEW_TEXT = {
  invited:
    "Your AI interview is ready: about 15 minutes, one attempt. Start it here or from the link we emailed you.",
  in_progress: "You started the AI interview. Continue where you left off.",
  completed: "Interview done. The business will get back to you.",
  expired: "The interview link has expired. Contact the business if you still want to take it.",
} as const;

const formatApplied = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function ScheduledEvent({ event }: { event: CandidateEventView }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-[#e5e5e5] bg-white p-3 text-[13px]">
      <p className="flex items-start gap-2 font-medium text-[#121212]">
        <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-[#737373]" />
        <span>
          {event.stageName} ({STAGE_KIND_LABELS[event.stageKind]}) ·{" "}
          {formatIndiaDateTime(event.startsAt)} · {event.durationMinutes} min
        </span>
      </p>
      {event.meetUrl && (
        <a
          href={event.meetUrl}
          className="inline-flex w-fit items-center gap-1.5 font-medium text-[#15803d] hover:underline"
        >
          <Video aria-hidden className="size-4" />
          Join Google Meet
        </a>
      )}
      {event.instructions && (
        <p className="whitespace-pre-line text-[#525252]">{event.instructions}</p>
      )}
      {event.externalUrl && (
        <a href={event.externalUrl} className="break-all text-[#15803d] underline">
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

  const rows = applications.map((application) => {
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
    return { application, status };
  });
  const active = rows.filter((row) => !CLOSED.includes(row.status.kind));
  const closed = rows.filter((row) => CLOSED.includes(row.status.kind));

  const renderRow = ({ application, status }: (typeof rows)[number]) => {
    const business = application.opportunity.organisationProfile.businessName;
    const applicationEvents = eventsByApplication.get(application.id) ?? [];
    const style = STATUS_STYLE[status.kind];
    const canOpenInterview =
      status.kind === "ai_interview" &&
      (status.interview === "invited" || status.interview === "in_progress");
    return (
      <article
        key={application.id}
        aria-label={application.opportunity.title}
        className="flex min-w-0 flex-col gap-3 border-b border-[#f0f0f0] px-4 py-4 last:border-b-0 sm:px-5"
      >
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[14px] font-semibold text-[#404040]"
          >
            {business.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold text-[#121212]">
              {application.opportunity.title}
            </h3>
            <p className="truncate text-[13px] text-[#737373]">
              {business} · Applied {formatApplied(application.appliedAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full max-sm:pl-[3.25rem]">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium ${style.pill}`}
            >
              <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
              {status.kind === "ai_interview" &&
              status.label.trim().toLowerCase() !== "ai interview"
                ? `AI interview · ${status.label}`
                : status.label}
            </span>
            {canOpenInterview && status.kind === "ai_interview" ? (
              // POST: it issues a fresh private link (the emailed one stops working).
              <form method="post" action={`/interview/open/${application.id}`}>
                <button type="submit" className={buttonVariants({ size: "sm" })}>
                  {status.interview === "invited" ? "Start interview" : "Continue interview"}
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 text-[13px] sm:pl-[3.25rem]">
          {status.kind === "applied" && (
            <p className="text-[#737373]">Waiting for {business} to review your application.</p>
          )}
          {status.kind === "ai_interview" && (
            <p className="text-[#525252]">{AI_INTERVIEW_TEXT[status.interview]}</p>
          )}
          {status.kind === "offer" && (
            <section
              aria-label="Your offer"
              className="flex min-w-0 flex-col gap-3 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-4"
            >
              <p className="text-[14px] font-semibold text-[#15803d]">
                {business} is offering you this role
              </p>
              {application.offerMessage && (
                <p className="break-words whitespace-pre-line text-[#262626]">
                  {application.offerMessage}
                </p>
              )}
              {(formatStipend(application.offerStipendInr) ||
                formatStartDate(application.offerStartDate)) && (
                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {formatStipend(application.offerStipendInr) && (
                    <div>
                      <dt className="text-[12px] text-[#15803d]">Stipend</dt>
                      <dd className="font-medium text-[#121212]">
                        {formatStipend(application.offerStipendInr)}
                      </dd>
                    </div>
                  )}
                  {formatStartDate(application.offerStartDate) && (
                    <div>
                      <dt className="text-[12px] text-[#15803d]">Start date</dt>
                      <dd className="font-medium text-[#121212]">
                        {formatStartDate(application.offerStartDate)}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <OfferAnswer applicationId={application.id} business={business} />
            </section>
          )}
          {status.kind === "offer_declined" && (
            <p className="text-[#737373]">You declined {business}&apos;s offer.</p>
          )}
          {status.kind === "hired" && (
            <p className="text-[#262626]">
              You&apos;re hired! Contact {business} at{" "}
              <span className="font-medium">
                {application.opportunity.organisationProfile.user.email}
              </span>
            </p>
          )}
          {status.kind === "not_selected" && (
            <div className="flex flex-col gap-2">
              <p className="text-[#737373]">
                {business} went with someone else this time. Keep adding proof and applying.
              </p>
              {application.notSelectedReason && (
                <p className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 break-words whitespace-pre-line text-[#525252]">
                  {application.notSelectedReason}
                </p>
              )}
            </div>
          )}
          {applicationEvents.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] font-medium text-[#737373]">Live interview</p>
              {applicationEvents.map((event) => (
                <ScheduledEvent key={event.id} event={event} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href={`/opportunities/${application.opportunity.id}`}
              className="inline-flex items-center gap-1 font-medium text-[#525252] transition-colors hover:text-[#121212]"
            >
              View listing
              <ExternalLink aria-hidden className="size-3.5" />
            </Link>
            {application.status === "submitted" && application.offerStatus !== "pending" && (
              <form action={withdrawAction}>
                <input type="hidden" name="applicationId" value={application.id} />
                <button
                  type="submit"
                  className="cursor-pointer font-medium text-[#737373] transition-colors hover:text-[#b91c1c]"
                >
                  Withdraw
                </button>
              </form>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <RoleHome
      title="Your applications"
      name={session.user.name}
      description={
        applications.length > 0
          ? `${applications.length} ${applications.length === 1 ? "application" : "applications"} · ${active.length} active`
          : "Every job you apply to shows up here, with what happens next."
      }
      actions={
        <Link href="/opportunities" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Find more jobs
        </Link>
      }
    >
      {applications.length === 0 ? (
        <EmptyState>
          You have not applied yet.{" "}
          <Link href="/opportunities" className="underline">
            Browse opportunities
          </Link>
        </EmptyState>
      ) : null}

      {[
        { key: "active", title: "Active", items: active },
        { key: "closed", title: "Closed", items: closed },
      ]
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section
            key={group.key}
            aria-labelledby={`group-${group.key}`}
            className="flex flex-col gap-2.5"
          >
            <h2
              id={`group-${group.key}`}
              className="flex items-center gap-2 text-[13px] font-semibold text-[#525252]"
            >
              {group.title}
              <span className="rounded-md bg-[#f0f0f0] px-1.5 py-0.5 text-[12px] font-medium text-[#737373] tabular-nums">
                {group.items.length}
              </span>
            </h2>
            <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
              {group.items.map(renderRow)}
            </div>
          </section>
        ))}
    </RoleHome>
  );
}
