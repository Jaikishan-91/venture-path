import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StatTile } from "@/components/dashboard/stat-tile";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveHiringManager } from "@/lib/authz";
import {
  getHiringManagerDashboard,
  type HiringManagerDashboardEvent,
} from "@/lib/dashboard/hiring-manager";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { STAGE_KIND_LABELS } from "@/lib/hiring/types";

export const metadata: Metadata = { title: "Hiring manager · VenturePath" };

function EventRow({ event }: { event: HiringManagerDashboardEvent }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f7f9] p-3">
      <div className="min-w-0">
        <Link
          href={`/hiring-manager/interviews/${event.id}`}
          className="block truncate font-medium text-[#1b2a26] underline-offset-4 hover:underline"
        >
          {event.candidateName} · {event.listingTitle}
        </Link>
        <p className="truncate text-sm text-[#4a4d53]">
          {STAGE_KIND_LABELS[event.stageKind]} · {event.stageName} ·{" "}
          {formatIndiaDateTime(event.startsAt)}
        </p>
      </div>
      {event.meetUrl ? (
        <a
          href={event.meetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Join Meet
        </a>
      ) : (
        <span className="shrink-0 text-xs text-[#4a4d53]">-</span>
      )}
    </li>
  );
}

export default async function HiringManagerHomePage() {
  const { session, membership } = await requireActiveHiringManager();
  const dashboard = await getHiringManagerDashboard(
    session.user.id,
    membership.organisationProfileId,
  );

  return (
    <RoleHome title="Dashboard" name={session.user.name}>
      <DashboardSection title={`Hiring manager at ${membership.organisationName}`}>
        <p className="text-sm text-[#4a4d53]">AI Hiring Manager — coming soon.</p>
      </DashboardSection>

      <StatGrid>
        <StatTile label="Today" value={dashboard.counts.today} href="/hiring-manager/interviews" />
        <StatTile
          label="Next 7 days"
          value={dashboard.counts.upcomingWeek}
          href="/hiring-manager/interviews"
        />
        <StatTile
          label="Awaiting your feedback"
          value={dashboard.counts.awaitingFeedback}
          tone={dashboard.counts.awaitingFeedback > 0 ? "warn" : "default"}
        />
        <StatTile label="Feedback submitted" value={dashboard.counts.feedbackSubmitted} />
      </StatGrid>

      <DashboardSection
        title="Next interviews"
        action={{ href: "/hiring-manager/interviews", label: "View all" }}
      >
        {dashboard.nextEvents.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {dashboard.nextEvents.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        ) : (
          <EmptyState>No upcoming interviews.</EmptyState>
        )}
      </DashboardSection>

      <DashboardSection title="Awaiting your feedback">
        {dashboard.awaitingFeedbackEvents.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {dashboard.awaitingFeedbackEvents.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        ) : (
          <EmptyState>Nothing waiting on your feedback.</EmptyState>
        )}
      </DashboardSection>
    </RoleHome>
  );
}
