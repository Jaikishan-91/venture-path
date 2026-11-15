import { Check, ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { requireActiveHiringManager } from "@/lib/authz";
import { listAssignedEvents, type AssignedEventSummary } from "@/lib/hm-interviews";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { SCHEDULE_STATUS_LABELS, STAGE_KIND_LABELS } from "@/lib/hiring/types";

export const metadata: Metadata = { title: "Interviews · Venture Path" };

const SCOPES = ["upcoming", "past"] as const;
type Scope = (typeof SCOPES)[number];

const SCOPE_LABELS: Record<Scope, string> = { upcoming: "Upcoming", past: "Past" };

const STATUS_STYLES: Record<AssignedEventSummary["status"], string> = {
  scheduled: "bg-[#eff6ff] text-[#1d4ed8]",
  completed: "bg-[#f0fdf4] text-[#15803d]",
  cancelled: "bg-[#f5f5f5] text-[#737373]",
};

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" });
const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" });

function parseScope(value: string | string[] | undefined): Scope {
  return SCOPES.find((scope) => scope === value) ?? "upcoming";
}

function EventRow({ event }: { event: AssignedEventSummary }) {
  return (
    <li className="group relative flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#fafafa] sm:px-5">
      <span
        aria-hidden
        className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] leading-none"
      >
        <span className="text-[10px] font-medium text-[#737373] uppercase">
          {monthFormat.format(event.startsAt)}
        </span>
        <span className="mt-0.5 text-[16px] font-semibold text-[#121212] tabular-nums">
          {dayFormat.format(event.startsAt)}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={`/hiring-manager/interviews/${event.id}`}
          className="block min-w-0 truncate text-[14px] font-medium text-[#121212] after:absolute after:inset-0"
        >
          {event.candidateName} · {event.listingTitle}
        </Link>
        <p className="mt-0.5 truncate text-[13px] text-[#737373]">
          {STAGE_KIND_LABELS[event.stageKind]} · {event.stageName} ·{" "}
          {formatIndiaDateTime(event.startsAt)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#737373]">
          <span className={`rounded-md px-1.5 py-0.5 font-medium ${STATUS_STYLES[event.status]}`}>
            {SCHEDULE_STATUS_LABELS[event.status]}
          </span>
          {event.feedbackSubmitted && (
            <span className="inline-flex items-center gap-1 font-medium text-[#15803d]">
              <Check aria-hidden className="size-3.5" />
              Feedback submitted
            </span>
          )}
          {event.otherInterviewers.length > 0 && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Users aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">With {event.otherInterviewers.join(", ")}</span>
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-[#d4d4d4] transition-colors group-hover:text-[#121212]"
      />
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
    <RoleHome
      title="Interviews"
      name={session.user.name}
      description={`Interviews you're assigned to at ${membership.organisationName}.`}
    >
      <nav
        aria-label="Scope"
        className="inline-flex self-start rounded-lg border border-[#e5e5e5] bg-white p-1"
      >
        {SCOPES.map((tab) => (
          <Link
            key={tab}
            href={`/hiring-manager/interviews?scope=${tab}`}
            aria-current={tab === scope ? "page" : undefined}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[#737373] transition-colors hover:text-[#121212] aria-[current=page]:bg-[#f5f5f5] aria-[current=page]:text-[#121212]"
          >
            {SCOPE_LABELS[tab]}
          </Link>
        ))}
      </nav>

      {events.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[#f0f0f0] overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
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
