import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusPill } from "@/components/dashboard/status-pill";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";
import { getOrganisationDashboard } from "@/lib/dashboard/organisation";
import type { OrganisationStatus } from "@/lib/profile-schemas";
import { getOrganisationProfile } from "@/lib/profiles";

export const metadata: Metadata = { title: "Organisation · VenturePath" };

const STATUS_TEXT: Record<OrganisationStatus, { label: string; detail: string }> = {
  pending: {
    label: "Awaiting review",
    detail: "An admin will review your business. Your listings stay hidden until it's approved.",
  },
  approved: { label: "Approved", detail: "Users can see your published listings." },
  rejected: {
    label: "Not approved",
    detail: "Update your profile and save it to submit it for review again.",
  },
};

const formatDeadline = (deadline: Date) =>
  deadline.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" });

const formatAppliedAt = (date: Date) =>
  date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function OrganisationHomePage() {
  const session = await requireRole("organisation");
  const profile = await getOrganisationProfile(session.user.id);
  const dashboard = profile ? await getOrganisationDashboard(session.user.id) : null;

  return (
    <RoleHome title="Organisation dashboard" name={session.user.name}>
      {profile && dashboard ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{profile.businessName}</CardTitle>
              <CardDescription>
                {profile.industry} · {profile.location}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <div role="status" className="rounded-md bg-muted p-3">
                <p className="font-medium">Status: {STATUS_TEXT[profile.status].label}</p>
                {profile.status === "rejected" && profile.rejectionReason && (
                  <p>Reason: {profile.rejectionReason}</p>
                )}
                <p className="text-muted-foreground">{STATUS_TEXT[profile.status].detail}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/organisation/opportunities" className={buttonVariants()}>
                  Your listings
                </Link>
                {/* Only approved organisations can create listings, as on the listings page. */}
                {profile.status === "approved" && (
                  <Link
                    href="/organisation/opportunities/new"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    New listing
                  </Link>
                )}
                <Link
                  href="/organisation/profile"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Edit profile
                </Link>
              </div>
            </CardContent>
          </Card>

          <StatGrid>
            <StatTile
              label="Published"
              value={dashboard.listingCounts.published}
              href="/organisation/opportunities"
            />
            <StatTile
              label="Drafts"
              value={dashboard.listingCounts.drafts}
              href="/organisation/opportunities"
            />
            <StatTile
              label="Closed"
              value={dashboard.listingCounts.closed}
              href="/organisation/opportunities"
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
            <StatTile
              label="Active applicants"
              value={dashboard.applicantCounts.activeApplicants}
            />
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
          </StatGrid>

          <DashboardSection
            title="Your listings"
            action={{ href: "/organisation/opportunities", label: "View all" }}
          >
            {dashboard.listings.length === 0 ? (
              <EmptyState>No listings yet. Create your first listing.</EmptyState>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#ecedef] text-xs tracking-wide text-[#4a4d53] uppercase">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Listing
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Status
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Deadline
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Total
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Under review
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Accepted
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          Not selected
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.listings.map((listing) => (
                        <tr key={listing.id} className="border-b border-[#ecedef] last:border-0">
                          <td className="max-w-[220px] truncate py-2 pr-3">
                            <Link
                              href={`/organisation/opportunities/${listing.id}/applicants`}
                              className="text-[#26594a] underline-offset-4 hover:underline"
                            >
                              {listing.title}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">
                            <StatusPill status={listing.status} />
                          </td>
                          <td className="py-2 pr-3 text-[#4a4d53]">
                            {listing.deadline ? formatDeadline(listing.deadline) : "—"}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{listing.total}</td>
                          <td className="py-2 pr-3 tabular-nums">{listing.underReview}</td>
                          <td className="py-2 pr-3 tabular-nums">{listing.accepted}</td>
                          <td className="py-2 tabular-nums">{listing.notSelected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="flex flex-col gap-3 md:hidden">
                  {dashboard.listings.map((listing) => (
                    <li key={listing.id} className="min-w-0 rounded-xl bg-[#f7f7f9] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/organisation/opportunities/${listing.id}/applicants`}
                          className="min-w-0 truncate font-medium text-[#26594a] underline-offset-4 hover:underline"
                        >
                          {listing.title}
                        </Link>
                        <StatusPill status={listing.status} />
                      </div>
                      <p className="mt-1 text-xs text-[#4a4d53]">
                        {listing.deadline
                          ? `Deadline ${formatDeadline(listing.deadline)}`
                          : "No deadline"}
                      </p>
                      <p className="mt-1 text-xs text-[#4a4d53]">
                        Total {listing.total} · Under review {listing.underReview} · Accepted{" "}
                        {listing.accepted} · Not selected {listing.notSelected}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </DashboardSection>

          <DashboardSection title="Recent applicants">
            {dashboard.recentApplicants.length === 0 ? (
              <EmptyState>No applicants yet.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {dashboard.recentApplicants.map((applicant) => (
                  <li
                    key={applicant.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ecedef] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#1b2a26]">
                        {applicant.applicantName}
                      </p>
                      <Link
                        href={`/organisation/opportunities/${applicant.opportunityId}/applicants`}
                        className="block truncate text-xs text-[#26594a] underline-offset-4 hover:underline"
                      >
                        {applicant.opportunityTitle}
                      </Link>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-[#4a4d53]">
                      <span>{formatAppliedAt(applicant.appliedAt)}</span>
                      {applicant.score !== null && <span>Score {applicant.score}</span>}
                      <StatusPill status={applicant.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>

          <DashboardSection title="Closing soon">
            {dashboard.closingSoon.length === 0 ? (
              <EmptyState>No published listings closing in the next 7 days.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {dashboard.closingSoon.map((listing) => (
                  <li key={listing.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      href={`/organisation/opportunities/${listing.id}/edit`}
                      className="min-w-0 truncate text-[#26594a] underline-offset-4 hover:underline"
                    >
                      {listing.title}
                    </Link>
                    <span className="shrink-0 text-xs text-[#4a4d53]">
                      Apply by {formatDeadline(listing.deadline)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create your business profile</CardTitle>
            <CardDescription>
              An admin reviews your business before your listings are shown to users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/organisation/profile" className={buttonVariants()}>
              Create profile
            </Link>
          </CardContent>
        </Card>
      )}
    </RoleHome>
  );
}
