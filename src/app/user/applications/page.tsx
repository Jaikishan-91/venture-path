import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listUserApplications } from "@/lib/applications";
import { requireRole } from "@/lib/authz";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { STAGE_KIND_LABELS } from "@/lib/hiring/types";
import { listUpcomingEventsForCandidate, type CandidateEventView } from "@/lib/scheduling";
import { withdrawAction } from "@/app/opportunities/[id]/actions";

export const metadata: Metadata = { title: "Your applications · VenturePath" };

const STATUS_LABEL = {
  submitted: "Waiting for a decision",
  accepted: "Accepted",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};

function ScheduledEvent({ event }: { event: CandidateEventView }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-[#f7f7f9] p-3">
      <p className="font-medium">
        {event.stageName} ({STAGE_KIND_LABELS[event.stageKind]}) ·{" "}
        {formatIndiaDateTime(event.startsAt)} · {event.durationMinutes} min
      </p>
      <p>
        {event.meetUrl ? (
          <a href={event.meetUrl} className="underline">
            Join Google Meet
          </a>
        ) : (
          "-"
        )}
      </p>
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
        const hasPipeline = application.opportunity._count.stages > 0;
        const applicationEvents = eventsByApplication.get(application.id) ?? [];
        return (
          <Card key={application.id}>
            <CardHeader>
              <CardTitle>{application.opportunity.title}</CardTitle>
              <CardDescription>
                {application.opportunity.organisationProfile.businessName} ·{" "}
                {STATUS_LABEL[application.status]}
                {hasPipeline && ` · ${application.currentStage?.name ?? "Applied"}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {application.status === "accepted" && (
                <p>Contact: {application.opportunity.organisationProfile.user.email}</p>
              )}
              <Link href={`/opportunities/${application.opportunity.id}`} className="underline">
                View listing
              </Link>
              {application.status === "submitted" && (
                <form action={withdrawAction}>
                  <input type="hidden" name="applicationId" value={application.id} />
                  <button type="submit" className="underline">
                    Withdraw
                  </button>
                </form>
              )}
              {applicationEvents.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-[#4a4d53]">Scheduled</p>
                  {applicationEvents.map((event) => (
                    <ScheduledEvent key={event.id} event={event} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </RoleHome>
  );
}
