import { Check, ChevronRight, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusPill } from "@/components/dashboard/status-pill";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { getUserDashboard, type OpportunityCard } from "@/lib/dashboard/user";
import { WORK_MODE_LABELS } from "@/lib/opportunity-schemas";

export const metadata: Metadata = { title: "Dashboard · Venture Path" };

/** Deadlines are `@db.Date` (UTC midnight); timestamps are shown in India time. */
const formatDeadline = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[13px] font-semibold text-[#404040]"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function JobRow({ opportunity, applied }: { opportunity: OpportunityCard; applied?: boolean }) {
  return (
    <li>
      <Link
        href={`/opportunities/${opportunity.id}`}
        className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[#fafafa]"
      >
        <Initial name={opportunity.businessName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-[#121212]">
            {opportunity.title}
          </span>
          <span className="block truncate text-[13px] text-[#737373]">
            {opportunity.businessName} · {WORK_MODE_LABELS[opportunity.workMode]}
            {opportunity.city && `, ${opportunity.city}`}
          </span>
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-0.5 text-[12px] sm:flex">
          {opportunity.match !== undefined ? (
            <span className="rounded-md bg-[#f0fdf4] px-1.5 py-0.5 font-medium text-[#15803d]">
              {opportunity.match}% match
            </span>
          ) : null}
          {applied ? <span className="font-medium text-[#15803d]">Applied</span> : null}
          {opportunity.deadline ? (
            <span className="text-[#737373]">Apply by {formatDeadline(opportunity.deadline)}</span>
          ) : null}
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-[#d4d4d4] transition-colors group-hover:text-[#121212]"
        />
      </Link>
    </li>
  );
}

export default async function UserHomePage() {
  const session = await requireRole("user");
  const dashboard = await getUserDashboard(session.user.id);
  const { profile, completeness } = dashboard;
  const firstName = session.user.name.trim().split(/\s+/)[0] || session.user.name;

  return (
    <RoleHome
      title={`Welcome back, ${firstName}`}
      name={session.user.name}
      description={
        dashboard.newThisWeek > 0
          ? `${dashboard.newThisWeek} new ${dashboard.newThisWeek === 1 ? "opportunity" : "opportunities"} this week.`
          : "Here's where your applications stand."
      }
      actions={
        <>
          <Link href="/challenges" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Browse challenges
          </Link>
          <Link href="/user/proof" className={buttonVariants({ size: "sm" })}>
            Add proof
          </Link>
        </>
      }
    >
      <StatGrid>
        <StatTile
          label="Applications"
          value={dashboard.applicationCounts.total}
          href="/user/applications"
        />
        <StatTile
          label="Under review"
          value={dashboard.applicationCounts.submitted}
          href="/user/applications"
          tone={dashboard.applicationCounts.submitted > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Accepted"
          value={dashboard.applicationCounts.accepted}
          href="/user/applications"
          tone={dashboard.applicationCounts.accepted > 0 ? "accent" : "default"}
        />
        <StatTile
          label="Not selected"
          value={dashboard.applicationCounts.rejected}
          href="/user/applications"
        />
      </StatGrid>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DashboardSection
            title="Find your next opportunity"
            description={dashboard.recommendedTitle}
            action={{ href: "/opportunities", label: "Explore jobs" }}
          >
            {dashboard.recommended.length > 0 ? (
              <ul className="-my-2.5 flex flex-col divide-y divide-[#f0f0f0]">
                {dashboard.recommended.map((opportunity) => (
                  <JobRow key={opportunity.id} opportunity={opportunity} />
                ))}
              </ul>
            ) : (
              <EmptyState>No open opportunities right now. Check back soon.</EmptyState>
            )}
          </DashboardSection>

          <DashboardSection
            title="Recent applications"
            action={{ href: "/user/applications", label: "View all" }}
          >
            {dashboard.recentApplications.length > 0 ? (
              <ul className="-my-2.5 flex flex-col divide-y divide-[#f0f0f0]">
                {dashboard.recentApplications.map((application) => (
                  <li key={application.id} className="flex min-w-0 items-center gap-3 py-2.5">
                    <Initial name={application.businessName} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/opportunities/${application.opportunityId}`}
                        className="block truncate text-[14px] font-medium text-[#121212] underline-offset-4 hover:underline"
                      >
                        {application.opportunityTitle}
                      </Link>
                      <p className="truncate text-[13px] text-[#737373]">
                        {application.businessName} · Applied {formatDate(application.appliedAt)}
                      </p>
                    </div>
                    <StatusPill status={application.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>
                You haven&apos;t applied yet.{" "}
                <Link href="/opportunities" className="underline">
                  Browse opportunities
                </Link>
                .
              </EmptyState>
            )}
          </DashboardSection>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-label={profile ? "Profile" : "Complete your profile"}
            className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
          >
            <div className="flex items-center gap-3 p-5">
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[15px] font-semibold text-white"
              >
                {session.user.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#121212]">
                  {session.user.name}
                </p>
                <p className="text-[13px] leading-snug text-[#737373]">
                  {profile
                    ? `${profile.course}, ${profile.institution} · Class of ${profile.graduationYear}`
                    : "No profile yet"}
                </p>
              </div>
            </div>

            <div className="border-t border-[#f0f0f0] px-5 py-4">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-medium text-[#121212]">Profile strength</span>
                <span className="text-[#737373] tabular-nums">{completeness.percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Profile completeness"
                aria-valuenow={completeness.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]"
              >
                <div
                  className="h-full rounded-full bg-[#16a34a]"
                  style={{ width: `${completeness.percent}%` }}
                />
              </div>
              {completeness.missing.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {completeness.missing.map((item) => (
                    <li key={item}>
                      <Link
                        href="/user/profile"
                        className="flex items-center gap-2 text-[13px] text-[#525252] transition-colors hover:text-[#121212]"
                      >
                        <Circle aria-hidden className="size-3.5 text-[#d4d4d4]" />
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-[#15803d]">
                  <Check aria-hidden className="size-3.5" /> Your profile is complete
                </p>
              )}
            </div>

            {profile && profile.skills.length > 0 ? (
              <ul
                aria-label="Skills"
                className="flex flex-wrap gap-1.5 border-t border-[#f0f0f0] px-5 py-4"
              >
                {profile.skills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-md border border-[#e5e5e5] px-2 py-0.5 text-[12px] text-[#404040]"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            ) : null}

            {profile && profile.links.length > 0 ? (
              <ul
                aria-label="Links"
                className="flex flex-col gap-1 border-t border-[#f0f0f0] px-5 py-4"
              >
                {profile.links.map((link) => (
                  <li key={link} className="min-w-0">
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="block truncate text-[13px] text-[#15803d] hover:underline"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="border-t border-[#f0f0f0] bg-[#fafafa] px-5 py-3">
              {profile ? (
                <Link
                  href="/user/profile"
                  className="text-[13px] font-medium text-[#121212] hover:underline"
                >
                  Edit profile
                </Link>
              ) : (
                <Link href="/user/profile" className={buttonVariants({ size: "sm" })}>
                  Create profile
                </Link>
              )}
            </div>
          </section>

          <DashboardSection title="Closing soon">
            {dashboard.closingSoon.length > 0 ? (
              <ul className="-my-2.5 flex flex-col divide-y divide-[#f0f0f0]">
                {dashboard.closingSoon.map((opportunity) => (
                  <li key={opportunity.id}>
                    <Link
                      href={`/opportunities/${opportunity.id}`}
                      className="group flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-[#121212] group-hover:underline">
                          {opportunity.title}
                        </span>
                        <span className="block truncate text-[12px] text-[#737373]">
                          {opportunity.businessName}
                          {opportunity.applied ? " · Applied" : ""}
                        </span>
                      </span>
                      {opportunity.deadline ? (
                        <span className="shrink-0 text-[12px] font-medium text-[#b45309]">
                          {formatDeadline(opportunity.deadline)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Nothing closes in the next 7 days.</EmptyState>
            )}
          </DashboardSection>
        </div>
      </div>
    </RoleHome>
  );
}
