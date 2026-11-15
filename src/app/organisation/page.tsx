import { ChevronRight, Plus, Trophy, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusPill } from "@/components/dashboard/status-pill";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { getOrganisationDashboard } from "@/lib/dashboard/organisation";
import type { OrganisationStatus } from "@/lib/profile-schemas";
import { getOrganisationProfile } from "@/lib/profiles";

export const metadata: Metadata = { title: "Dashboard · Venture Path" };

const STATUS_TEXT: Record<
  OrganisationStatus,
  { label: string; detail: string; className: string; dot: string }
> = {
  pending: {
    label: "Awaiting review",
    detail: "An admin will review your business. Your listings stay hidden until it's approved.",
    className: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    dot: "bg-[#d97706]",
  },
  approved: {
    label: "Approved",
    detail: "Users can see your published listings.",
    className: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
    dot: "bg-[#16a34a]",
  },
  rejected: {
    label: "Not approved",
    detail: "Update your profile and save it to submit it for review again.",
    className: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
    dot: "bg-[#dc2626]",
  },
};

const formatDeadline = (deadline: Date) =>
  deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

const formatAppliedAt = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function Initial({ name, round = false }: { name: string; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-9 shrink-0 items-center justify-center border border-[#e5e5e5] bg-[#fafafa] text-[13px] font-semibold text-[#404040] ${
        round ? "rounded-full" : "rounded-lg"
      }`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default async function OrganisationHomePage() {
  const session = await requireRole("organisation");
  const profile = await getOrganisationProfile(session.user.id);
  const dashboard = profile ? await getOrganisationDashboard(session.user.id) : null;
  const firstName = session.user.name.trim().split(/\s+/)[0] || session.user.name;

  if (!profile || !dashboard) {
    return (
      <RoleHome
        title={`Welcome, ${firstName}`}
        name={session.user.name}
        description="Set up your business to start posting challenges and jobs."
      >
        <section className="flex flex-col items-start gap-4 rounded-xl border border-[#e5e5e5] bg-white p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-semibold text-[#121212]">
              Create your business profile
            </h2>
            <p className="max-w-lg text-[14px] text-[#737373]">
              An admin reviews your business before your listings are shown to users. It takes a
              couple of minutes.
            </p>
          </div>
          <Link href="/organisation/profile" className={buttonVariants()}>
            Create profile
          </Link>
        </section>
      </RoleHome>
    );
  }

  const status = STATUS_TEXT[profile.status];
  const approved = profile.status === "approved";

  return (
    <RoleHome
      title={`Welcome back, ${firstName}`}
      name={session.user.name}
      description={`${profile.businessName} · ${profile.industry} · ${profile.location}`}
      actions={
        <>
          <Link
            href="/organisation/opportunities"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Your listings
          </Link>
          {/* Only approved organisations can create listings, as on the listings page. */}
          {approved && (
            <Link href="/organisation/opportunities/new" className={buttonVariants({ size: "sm" })}>
              <Plus data-icon="inline-start" />
              New listing
            </Link>
          )}
        </>
      }
    >
      <div
        role="status"
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-[14px] ${status.className}`}
      >
        <span className="inline-flex items-center gap-2 font-semibold">
          <span aria-hidden className={`size-2 rounded-full ${status.dot}`} />
          Status: {status.label}
        </span>
        <span className="opacity-90">{status.detail}</span>
        {profile.status === "rejected" && profile.rejectionReason && (
          <span className="w-full">Reason: {profile.rejectionReason}</span>
        )}
      </div>

      <StatGrid>
        <StatTile
          label="Published"
          value={dashboard.listingCounts.published}
          hint={`${dashboard.listingCounts.closed} closed`}
          href="/organisation/opportunities"
        />
        <StatTile
          label="Drafts"
          value={dashboard.listingCounts.drafts}
          href="/organisation/opportunities"
        />
        <StatTile label="Active applicants" value={dashboard.applicantCounts.activeApplicants} />
        <StatTile
          label="Awaiting decision"
          value={dashboard.applicantCounts.awaitingDecision}
          tone={dashboard.applicantCounts.awaitingDecision > 0 ? "warn" : "default"}
        />
        <StatTile label="Accepted" value={dashboard.applicantCounts.accepted} />
        <StatTile label="Not selected" value={dashboard.applicantCounts.notSelected} />
        <StatTile
          label="Interviews next 7 days"
          value={dashboard.upcomingInterviews}
          tone={dashboard.upcomingInterviews > 0 ? "accent" : "default"}
        />
        <StatTile
          label="Avg AI match"
          value={dashboard.avgScore.count === 0 ? "—" : dashboard.avgScore.average}
          hint={
            dashboard.avgScore.count === 0
              ? "No analyses yet"
              : `from ${dashboard.avgScore.count} ${dashboard.avgScore.count === 1 ? "analysis" : "analyses"}`
          }
        />
      </StatGrid>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DashboardSection
            title="Your listings"
            description="Applicants per listing, by stage"
            action={{ href: "/organisation/opportunities", label: "View all" }}
          >
            {dashboard.listings.length === 0 ? (
              <EmptyState>No listings yet. Create your first listing.</EmptyState>
            ) : (
              <ul className="-my-2.5 flex flex-col divide-y divide-[#f0f0f0]">
                {dashboard.listings.map((listing) => (
                  <li key={listing.id}>
                    <Link
                      href={`/organisation/opportunities/${listing.id}/applicants`}
                      className="group -mx-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-3 transition-colors hover:bg-[#fafafa]"
                    >
                      <span className="min-w-0 flex-1 basis-56">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium text-[#121212]">
                            {listing.title}
                          </span>
                          <StatusPill status={listing.status} />
                        </span>
                        <span className="mt-0.5 block text-[12px] text-[#737373]">
                          {listing.deadline
                            ? `Apply by ${formatDeadline(listing.deadline)}`
                            : "No deadline"}
                        </span>
                      </span>
                      <span className="flex items-center gap-4 text-[12px] text-[#737373] tabular-nums">
                        <Count label="Total" value={listing.total} strong />
                        <Count label="Review" value={listing.underReview} />
                        <Count label="Accepted" value={listing.accepted} />
                        <Count label="Not selected" value={listing.notSelected} />
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="hidden size-4 shrink-0 text-[#d4d4d4] transition-colors group-hover:text-[#121212] sm:block"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>

          <DashboardSection title="Recent applicants">
            {dashboard.recentApplicants.length === 0 ? (
              <EmptyState>No applicants yet.</EmptyState>
            ) : (
              <ul className="-my-2.5 flex flex-col divide-y divide-[#f0f0f0]">
                {dashboard.recentApplicants.map((applicant) => (
                  <li key={applicant.id} className="flex min-w-0 items-center gap-3 py-2.5">
                    <Initial name={applicant.applicantName} round />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[#121212]">
                        {applicant.applicantName}
                      </p>
                      <Link
                        href={`/organisation/opportunities/${applicant.opportunityId}/applicants`}
                        className="block truncate text-[13px] text-[#737373] underline-offset-4 hover:text-[#121212] hover:underline"
                      >
                        {applicant.opportunityTitle} · {formatAppliedAt(applicant.appliedAt)}
                      </Link>
                    </div>
                    {applicant.score !== null && (
                      <span className="hidden shrink-0 rounded-md border border-[#e5e5e5] px-1.5 py-0.5 text-[12px] font-medium text-[#404040] tabular-nums sm:inline">
                        Score {applicant.score}
                      </span>
                    )}
                    <StatusPill status={applicant.status} />
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-label="Business"
            className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
          >
            <div className="flex items-center gap-3 p-5">
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#121212] text-[15px] font-semibold text-white"
              >
                {profile.businessName.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#121212]">
                  {profile.businessName}
                </p>
                <p className="truncate text-[13px] text-[#737373]">
                  {profile.industry} · {profile.location}
                </p>
              </div>
            </div>
            <nav aria-label="Quick actions" className="flex flex-col border-t border-[#f0f0f0] p-2">
              {approved && (
                <QuickLink href="/organisation/challenges/new" icon={<Trophy />}>
                  Post a challenge
                </QuickLink>
              )}
              <QuickLink href="/organisation/team" icon={<UserPlus />}>
                Invite a teammate
              </QuickLink>
            </nav>
            <div className="border-t border-[#f0f0f0] bg-[#fafafa] px-5 py-3">
              <Link
                href="/organisation/profile"
                className="text-[13px] font-medium text-[#121212] hover:underline"
              >
                Edit profile
              </Link>
            </div>
          </section>

          <DashboardSection title="Closing soon">
            {dashboard.closingSoon.length === 0 ? (
              <EmptyState>No published listings closing in the next 7 days.</EmptyState>
            ) : (
              <ul className="-my-2.5 flex flex-col divide-y divide-[#f0f0f0]">
                {dashboard.closingSoon.map((listing) => (
                  <li key={listing.id}>
                    <Link
                      href={`/organisation/opportunities/${listing.id}/edit`}
                      className="group flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="min-w-0 truncate text-[14px] font-medium text-[#121212] group-hover:underline">
                        {listing.title}
                      </span>
                      <span className="shrink-0 text-[12px] font-medium text-[#b45309]">
                        {formatDeadline(listing.deadline)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>
        </div>
      </div>
    </RoleHome>
  );
}

function Count({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span
        className={
          strong ? "text-[14px] font-semibold text-[#121212]" : "text-[14px] text-[#404040]"
        }
      >
        {value}
      </span>
      <span className="text-[11px]">{label}</span>
    </span>
  );
}

function QuickLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[14px] font-medium text-[#404040] transition-colors hover:bg-[#fafafa] hover:text-[#121212] [&_svg]:size-4 [&_svg]:text-[#a3a3a3]"
    >
      {icon}
      {children}
    </Link>
  );
}
