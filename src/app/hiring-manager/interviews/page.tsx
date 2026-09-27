import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveHiringManager } from "@/lib/authz";
import { listAssignedEvents, type AssignedEventSummary } from "@/lib/hm-interviews";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { SCHEDULE_STATUS_LABELS, STAGE_KIND_LABELS } from "@/lib/hiring/types";

export const metadata: Metadata = { title: "Interviews · VenturePath" };

const SCOPES = ["upcoming", "past"] as const;
type Scope = (typeof SCOPES)[number];

const SCOPE_LABELS: Record<Scope, string> = { upcoming: "Upcoming", past: "Past" };

function parseScope(value: string | string[] | undefined): Scope {
  return SCOPES.find((scope) => scope === value) ?? "upcoming";
}

function EventRow({ event }: { event: AssignedEventSummary }) {
  return (
    <li className="min-w-0 rounded-xl bg-[#f7f7f9] p-3">
      <Link
        href={`/hiring-manager/interviews/${event.id}`}
        className="block min-w-0 truncate font-medium text-[#1b2a26] underline-offset-4 hover:underline"
      >
        {event.candidateName} · {event.listingTitle}
      </Link>
      <p className="mt-0.5 truncate text-sm text-[#4a4d53]">
        {STAGE_KIND_LABELS[event.stageKind]} · {event.stageName} ·{" "}
        {formatIndiaDateTime(event.startsAt)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#4a4d53]">
        <span>{SCHEDULE_STATUS_LABELS[event.status]}</span>
        {event.feedbackSubmitted && (
          <span className="font-medium text-[#26594a]">Feedback submitted</span>
        )}
        {event.otherInterviewers.length > 0 && (
          <span>With {event.otherInterviewers.join(", ")}</span>
        )}
      </div>
    </li>
  );
}

export default async function HiringManagerInterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const { session, membership } = await requireActiveHiringManager();
  const scope = parseScope((await searchParams).scope);
  const events = await listAssignedEvents(session.user.id, membership.organisationProfileId, {
    scope,
  });

  return (
    <RoleHome title="Interviews" name={session.user.name}>
      <nav aria-label="Scope" className="flex gap-2">
        {SCOPES.map((tab) => (
          <Link
            key={tab}
            href={`/hiring-manager/interviews?scope=${tab}`}
            aria-current={tab === scope ? "page" : undefined}
            className={buttonVariants({
              variant: tab === scope ? "default" : "outline",
              size: "sm",
            })}
          >
            {SCOPE_LABELS[tab]}
          </Link>
        ))}
      </nav>

      {events.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      ) : (
        <EmptyState>
          {scope === "upcoming" ? "No upcoming interviews." : "No past interviews yet."}
        </EmptyState>
      )}
    </RoleHome>
  );
}
