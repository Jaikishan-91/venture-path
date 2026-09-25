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

export const metadata: Metadata = { title: "User · VenturePath" };

/** Deadlines are `@db.Date` (UTC midnight); timestamps are shown in India time. */
const formatDeadline = (date: Date) =>
  date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" });

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function JobCard({ opportunity, applied }: { opportunity: OpportunityCard; applied?: boolean }) {
  return (
    <li className="min-w-0 rounded-xl bg-[#f7f7f9] p-3">
      <Link
        href={`/opportunities/${opportunity.id}`}
        className="block min-w-0 truncate font-medium text-[#1b2a26] underline-offset-4 hover:underline"
      >
        {opportunity.title}
      </Link>
      <p className="mt-0.5 truncate text-sm text-[#4a4d53]">
        {opportunity.businessName} · {WORK_MODE_LABELS[opportunity.workMode]}
        {opportunity.city && `, ${opportunity.city}`}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#4a4d53]">
        {opportunity.match !== undefined && (
          <span className="font-medium text-[#26594a]">{opportunity.match}% match</span>
        )}
        {opportunity.deadline && <span>Apply by {formatDeadline(opportunity.deadline)}</span>}
        {applied && <span className="font-medium text-[#26594a]">Applied</span>}
      </div>
    </li>
  );
}

export default async function UserHomePage() {
  const session = await requireRole("user");
  const dashboard = await getUserDashboard(session.user.id);
  const { profile, completeness } = dashboard;

  return (
    <RoleHome title="User dashboard" name={session.user.name}>
      <DashboardSection title="Find your next opportunity">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/opportunities" className={buttonVariants({ className: "self-start" })}>
            Explore jobs
          </Link>
          <p className="text-sm text-[#4a4d53]">{dashboard.newThisWeek} new this week</p>
        </div>
      </DashboardSection>

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

      <DashboardSection title={profile ? "Profile" : "Complete your profile"}>
        {profile ? (
          <div className="flex flex-col gap-4">
            <div className="min-w-0">
              <p className="font-medium text-[#1b2a26]">{session.user.name}</p>
              <p className="truncate text-sm text-[#4a4d53]">
                {profile.course}, {profile.institution} · Class of {profile.graduationYear}
              </p>
            </div>
            {profile.skills.length > 0 && (
              <ul aria-label="Skills" className="flex flex-wrap gap-2 text-sm">
                {profile.skills.map((skill) => (
                  <li key={skill} className="rounded-md bg-[#f0f1f3] px-2 py-0.5 text-[#1b2a26]">
                    {skill}
                  </li>
                ))}
              </ul>
            )}
            {profile.links.length > 0 && (
              <ul aria-label="Links" className="flex flex-col gap-1 text-sm">
                {profile.links.map((link) => (
                  <li key={link} className="min-w-0">
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="break-all text-[#26594a] underline"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <div className="flex items-baseline justify-between gap-2 text-xs text-[#4a4d53]">
                <span>Profile completeness</span>
                <span className="tabular-nums">{completeness.percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Profile completeness"
                aria-valuenow={completeness.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-1 h-2 overflow-hidden rounded-full bg-[#f0f1f3]"
              >
                <div
                  className="h-full rounded-full bg-[#26594a]"
                  style={{ width: `${completeness.percent}%` }}
                />
              </div>
              {completeness.missing.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#4a4d53]">
                  {completeness.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
            <Link
              href="/user/profile"
              className={buttonVariants({ variant: "outline", className: "self-start" })}
            >
              Edit profile
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[#4a4d53]">
              Tell organisations where you study and what you can do. You&apos;ll need a profile to
              apply.
            </p>
            <Link href="/user/profile" className={buttonVariants({ className: "self-start" })}>
              Create profile
            </Link>
          </div>
        )}
      </DashboardSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardSection
          title={dashboard.recommendedTitle}
          action={{ href: "/user/recommendations", label: "View all" }}
        >
          {dashboard.recommended.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {dashboard.recommended.map((opportunity) => (
                <JobCard key={opportunity.id} opportunity={opportunity} />
              ))}
            </ul>
          ) : (
            <EmptyState>No open opportunities right now. Check back soon.</EmptyState>
          )}
        </DashboardSection>

        <DashboardSection title="Closing soon">
          {dashboard.closingSoon.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {dashboard.closingSoon.map((opportunity) => (
                <JobCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  applied={opportunity.applied}
                />
              ))}
            </ul>
          ) : (
            <EmptyState>Nothing closes in the next 7 days.</EmptyState>
          )}
        </DashboardSection>
      </div>

      <DashboardSection
        title="Recent applications"
        action={{ href: "/user/applications", label: "View all" }}
      >
        {dashboard.recentApplications.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {dashboard.recentApplications.map((application) => (
              <li
                key={application.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f7f9] p-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/opportunities/${application.opportunityId}`}
                    className="block truncate font-medium text-[#1b2a26] underline-offset-4 hover:underline"
                  >
                    {application.opportunityTitle}
                  </Link>
                  <p className="truncate text-sm text-[#4a4d53]">
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
    </RoleHome>
  );
}
