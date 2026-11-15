import { Video } from "lucide-react";
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

export const metadata: Metadata = { title: "Hiring manager · Venture Path" };

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" });
const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" });

/** Small calendar-style date block for an interview row. */
function DateBlock({ date }: { date: Date }) {
  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] leading-none"
    >
      <span className="text-[10px] font-medium text-[#737373] uppercase">
        {monthFormat.format(date)}
      </span>
      <span className="mt-0.5 text-[16px] font-semibold text-[#121212] tabular-nums">
        {dayFormat.format(date)}
      </span>
    </span>
  );
}

function EventRow({ event, feedback }: { event: HiringManagerDashboardEvent; feedback?: boolean }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 py-3">
      <DateBlock date={event.startsAt} />
      <div className="min-w-0 flex-1 basis-48">
        <Link
          href={`/hiring-manager/interviews/${event.id}`}
          className="block truncate text-[14px] font-medium text-[#121212] underline-offset-4 hover:underline"
        >
          {event.candidateName} · {event.listingTitle}
        </Link>
        <p className="truncate text-[13px] text-[#737373]">
          {STAGE_KIND_LABELS[event.stageKind]} · {event.stageName} ·{" "}
          {formatIndiaDateTime(event.startsAt)}
        </p>
      </div>
      {feedback ? (
        <Link
          href={`/hiring-manager/interviews/${event.id}`}
          className={buttonVariants({ size: "sm" })}
        >
          Give feedback
        </Link>
      ) : event.meetUrl ? (
        <a
          href={event.meetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Video data-icon="inline-start" />
          Join Meet
        </a>
      ) : (
        <span className="shrink-0 text-[12px] text-[#a3a3a3]">No Meet link</span>
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
  const firstName = session.user.name.trim().split(/\s+/)[0] || session.user.name;

  return (
    <RoleHome
      title={`Welcome back, ${firstName}`}
      name={session.user.name}
      description={`Hiring manager at ${membership.organisationName}. Candidates may also do an AI interview first; the organisation owner sees its report.`}
      actions={
        <Link
          href="/hiring-manager/interviews"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          All interviews
        </Link>
      }
    >
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

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <DashboardSection
          title="Next interviews"
          action={{ href: "/hiring-manager/interviews", label: "View all" }}
        >
          {dashboard.nextEvents.length > 0 ? (
            <ul className="-my-3 flex flex-col divide-y divide-[#f0f0f0]">
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
            <ul className="-my-3 flex flex-col divide-y divide-[#f0f0f0]">
              {dashboard.awaitingFeedbackEvents.map((event) => (
                <EventRow key={event.id} event={event} feedback />
              ))}
            </ul>
          ) : (
            <EmptyState>Nothing waiting on your feedback.</EmptyState>
          )}
        </DashboardSection>
      </div>
    </RoleHome>
  );
}
