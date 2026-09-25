import "server-only";
import { getDb } from "@/lib/db";
import type { OpportunityStatus } from "@/lib/opportunity-schemas";
import { indiaDateRange } from "./dates";
import type { ApplicationStatus } from "./statuses";

export type { ApplicationStatus };

const LISTINGS_LIMIT = 20;
const RECENT_APPLICANTS_LIMIT = 5;
const CLOSING_SOON_DAYS = 7;

export type ListingCounts = { published: number; drafts: number; closed: number };
export type ApplicantCounts = {
  activeApplicants: number;
  awaitingDecision: number;
  accepted: number;
  notSelected: number;
};

export type OrganisationListingRow = {
  id: string;
  title: string;
  status: OpportunityStatus;
  deadline: Date | null;
  updatedAt: Date;
  total: number;
  underReview: number;
  accepted: number;
  notSelected: number;
};

export type OrganisationRecentApplicant = {
  id: string;
  applicantName: string;
  opportunityId: string;
  opportunityTitle: string;
  appliedAt: Date;
  status: ApplicationStatus;
  score: number | null;
};

export type OrganisationClosingSoon = {
  id: string;
  title: string;
  deadline: Date;
};

export type OrganisationDashboard = {
  listingCounts: ListingCounts;
  applicantCounts: ApplicantCounts;
  avgScore: { average: number | null; count: number };
  listings: OrganisationListingRow[];
  recentApplicants: OrganisationRecentApplicant[];
  closingSoon: OrganisationClosingSoon[];
};

/** Reduces an `opportunity.groupBy(["status"])` result into zero-filled listing counts. Pure, for tests. */
export function summarizeListingCounts(
  rows: { status: OpportunityStatus; count: number }[],
): ListingCounts {
  const counts: ListingCounts = { published: 0, drafts: 0, closed: 0 };
  for (const row of rows) {
    if (row.status === "published") counts.published += row.count;
    else if (row.status === "draft") counts.drafts += row.count;
    else if (row.status === "closed") counts.closed += row.count;
  }
  return counts;
}

/** Reduces an `application.groupBy(["status"])` result into zero-filled applicant counts. Pure, for tests. */
export function summarizeApplicantCounts(
  rows: { status: ApplicationStatus; count: number }[],
): ApplicantCounts {
  const counts: ApplicantCounts = {
    activeApplicants: 0,
    awaitingDecision: 0,
    accepted: 0,
    notSelected: 0,
  };
  for (const row of rows) {
    if (row.status !== "withdrawn") counts.activeApplicants += row.count;
    if (row.status === "submitted") counts.awaitingDecision += row.count;
    if (row.status === "accepted") counts.accepted += row.count;
    if (row.status === "rejected") counts.notSelected += row.count;
  }
  return counts;
}

/**
 * Merges an `application.groupBy(["opportunityId", "status"])` result onto a list of listings,
 * adding per-listing applicant counts (withdrawn excluded from `total`). Pure, for tests.
 */
export function mergeListingApplicantCounts<T extends { id: string }>(
  listings: T[],
  rows: { opportunityId: string; status: ApplicationStatus; count: number }[],
): (T & { total: number; underReview: number; accepted: number; notSelected: number })[] {
  const byListing = new Map<
    string,
    { total: number; underReview: number; accepted: number; notSelected: number }
  >();
  for (const row of rows) {
    const entry = byListing.get(row.opportunityId) ?? {
      total: 0,
      underReview: 0,
      accepted: 0,
      notSelected: 0,
    };
    if (row.status !== "withdrawn") entry.total += row.count;
    if (row.status === "submitted") entry.underReview += row.count;
    else if (row.status === "accepted") entry.accepted += row.count;
    else if (row.status === "rejected") entry.notSelected += row.count;
    byListing.set(row.opportunityId, entry);
  }
  return listings.map((listing) => ({
    ...listing,
    ...(byListing.get(listing.id) ?? { total: 0, underReview: 0, accepted: 0, notSelected: 0 }),
  }));
}

/**
 * All organisation dashboard data in one pass, scoped to listings and applications owned by
 * `userId`. Independent groupBy/aggregate/findMany queries only, run with `Promise.all`.
 */
export async function getOrganisationDashboard(
  userId: string,
  now = new Date(),
): Promise<OrganisationDashboard> {
  const db = getDb();
  const ownedBy = { organisationProfile: { userId } };
  const { from, to } = indiaDateRange(CLOSING_SOON_DAYS, now);

  const [
    listingStatusRows,
    applicantStatusRows,
    avgScoreAgg,
    listings,
    applicantCountRows,
    recentApplicants,
    closingSoon,
  ] = await Promise.all([
    db.opportunity.groupBy({
      by: ["status"],
      where: ownedBy,
      _count: { _all: true },
    }),
    db.application.groupBy({
      by: ["status"],
      where: { opportunity: ownedBy },
      _count: { _all: true },
    }),
    db.analysis.aggregate({
      _avg: { score: true },
      _count: { _all: true },
      where: { application: { opportunity: ownedBy } },
    }),
    db.opportunity.findMany({
      where: ownedBy,
      orderBy: { updatedAt: "desc" },
      take: LISTINGS_LIMIT,
      select: { id: true, title: true, status: true, deadline: true, updatedAt: true },
    }),
    db.application.groupBy({
      by: ["opportunityId", "status"],
      where: { opportunity: ownedBy },
      _count: { _all: true },
    }),
    db.application.findMany({
      where: { status: { not: "withdrawn" }, opportunity: ownedBy },
      orderBy: { appliedAt: "desc" },
      take: RECENT_APPLICANTS_LIMIT,
      select: {
        id: true,
        status: true,
        appliedAt: true,
        opportunity: { select: { id: true, title: true } },
        userProfile: { select: { user: { select: { name: true } } } },
        analysis: { select: { score: true } },
      },
    }),
    db.opportunity.findMany({
      where: { ...ownedBy, status: "published", deadline: { gte: from, lte: to } },
      orderBy: { deadline: "asc" },
      select: { id: true, title: true, deadline: true },
    }),
  ]);

  const listingCounts = summarizeListingCounts(
    listingStatusRows.map((row) => ({
      status: row.status as OpportunityStatus,
      count: row._count._all,
    })),
  );
  const applicantCounts = summarizeApplicantCounts(
    applicantStatusRows.map((row) => ({
      status: row.status as ApplicationStatus,
      count: row._count._all,
    })),
  );
  const mergedListings = mergeListingApplicantCounts(
    listings,
    applicantCountRows.map((row) => ({
      opportunityId: row.opportunityId,
      status: row.status as ApplicationStatus,
      count: row._count._all,
    })),
  );

  return {
    listingCounts,
    applicantCounts,
    avgScore: {
      average: avgScoreAgg._count._all === 0 ? null : Math.round(avgScoreAgg._avg.score ?? 0),
      count: avgScoreAgg._count._all,
    },
    listings: mergedListings,
    // Prisma loads relations in a second query; an applicant deleted in between comes back without one.
    recentApplicants: recentApplicants
      .filter(
        (application) => application.userProfile?.user != null && application.opportunity != null,
      )
      .map((application) => ({
        id: application.id,
        applicantName: application.userProfile.user.name,
        opportunityId: application.opportunity.id,
        opportunityTitle: application.opportunity.title,
        appliedAt: application.appliedAt,
        status: application.status as ApplicationStatus,
        score: application.analysis?.score ?? null,
      })),
    closingSoon: closingSoon.map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      // Filtered on a non-null deadline range above.
      deadline: opportunity.deadline as Date,
    })),
  };
}
