import "server-only";
import { getDb } from "@/lib/db";
import { getLlmConfig, type LlmProviderKind } from "@/lib/llm/config";
import { countOrganisationsByStatus } from "@/lib/organisation-review";
import { OPPORTUNITY_STATUSES, type OpportunityStatus } from "@/lib/opportunity-schemas";
import { ORGANISATION_STATUSES, type OrganisationStatus } from "@/lib/profile-schemas";
import type { Role } from "@/lib/roles";
import { daysAgo } from "./dates";
import { APPLICATION_STATUSES, type ApplicationStatus } from "./statuses";

const NO_ROLE = "No role yet" as const;
export const USER_ROLE_KEYS = ["user", "organisation", "admin", NO_ROLE] as const;
export type UserRoleKey = (typeof USER_ROLE_KEYS)[number];

/** Fills a zero-valued record for every key, then overlays the given counts. Pure, for tests. */
export function fillCounts<K extends string>(
  keys: readonly K[],
  rows: { key: K; count: number }[],
): Record<K, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  for (const row of rows) counts[row.key] = row.count;
  return counts;
}

/** Turns a zero-filled counts record into ordered `{label, value}` items for `BarList`. Pure, for tests. */
export function toBarItems<K extends string>(
  counts: Record<K, number>,
  order: readonly K[],
  labels: Record<K, string>,
): { label: string; value: number }[] {
  return order.map((key) => ({ label: labels[key], value: counts[key] }));
}

const USER_ROLE_LABELS: Record<UserRoleKey, string> = {
  user: "User",
  organisation: "Organisation",
  admin: "Admin",
  [NO_ROLE]: NO_ROLE,
};

const ORGANISATION_STATUS_LABELS: Record<OrganisationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: "Under review",
  accepted: "Accepted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export type ReviewQueueEntry = {
  id: string;
  businessName: string;
  ownerName: string;
  industry: string;
  location: string;
  updatedAt: Date;
};

export type GrowthCounts = { last7: number; last30: number };

export type AdminAiStats = {
  analysisCount: number;
  averageScore: number | null;
  provider: { kind: LlmProviderKind; model: string };
};

export type AdminDashboard = {
  stats: {
    users: number;
    organisationsTotal: number;
    organisationsPending: number;
    listingsTotal: number;
    listingsPublished: number;
    applicationsTotal: number;
  };
  reviewQueue: ReviewQueueEntry[];
  breakdowns: {
    usersByRole: { label: string; value: number }[];
    organisationsByStatus: { label: string; value: number }[];
    listingsByStatus: { label: string; value: number }[];
    applicationOutcomes: { label: string; value: number }[];
  };
  growth: {
    users: GrowthCounts;
    organisations: GrowthCounts;
    listings: GrowthCounts;
    applications: GrowthCounts;
  };
  ai: AdminAiStats;
};

const REVIEW_QUEUE_LIMIT = 5;

/** All admin dashboard data in one pass: independent count/groupBy/aggregate queries only, no row scans. */
export async function getAdminDashboard(now = new Date()): Promise<AdminDashboard> {
  const db = getDb();
  const since7 = daysAgo(7, now);
  const since30 = daysAgo(30, now);

  const [
    roleRows,
    organisationCounts,
    opportunityRows,
    applicationRows,
    reviewQueue,
    usersLast7,
    usersLast30,
    organisationsLast7,
    organisationsLast30,
    listingsLast7,
    listingsLast30,
    applicationsLast7,
    applicationsLast30,
    analysisAgg,
  ] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    countOrganisationsByStatus(),
    db.opportunity.groupBy({ by: ["status"], _count: { _all: true } }),
    db.application.groupBy({ by: ["status"], _count: { _all: true } }),
    db.organisationProfile.findMany({
      where: { status: "pending" },
      select: {
        id: true,
        businessName: true,
        industry: true,
        location: true,
        updatedAt: true,
        user: { select: { name: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: REVIEW_QUEUE_LIMIT,
    }),
    db.user.count({ where: { role: "user", createdAt: { gte: since7 } } }),
    db.user.count({ where: { role: "user", createdAt: { gte: since30 } } }),
    db.organisationProfile.count({ where: { createdAt: { gte: since7 } } }),
    db.organisationProfile.count({ where: { createdAt: { gte: since30 } } }),
    db.opportunity.count({ where: { createdAt: { gte: since7 } } }),
    db.opportunity.count({ where: { createdAt: { gte: since30 } } }),
    db.application.count({ where: { appliedAt: { gte: since7 } } }),
    db.application.count({ where: { appliedAt: { gte: since30 } } }),
    db.analysis.aggregate({ _count: { _all: true }, _avg: { score: true } }),
  ]);

  const roleCounts = fillCounts(
    USER_ROLE_KEYS,
    roleRows.map((row) => ({
      key: (row.role as Role | null) ?? NO_ROLE,
      count: row._count._all,
    })),
  );
  // countOrganisationsByStatus() already returns a zero-filled record.
  const organisationStatusCounts = organisationCounts;
  const opportunityCounts = fillCounts(
    OPPORTUNITY_STATUSES,
    opportunityRows.map((row) => ({ key: row.status, count: row._count._all })),
  );
  const applicationCounts = fillCounts(
    APPLICATION_STATUSES,
    applicationRows.map((row) => ({
      key: row.status as ApplicationStatus,
      count: row._count._all,
    })),
  );

  const organisationsPending = organisationStatusCounts.pending;
  const organisationsTotal = ORGANISATION_STATUSES.reduce(
    (sum, status) => sum + organisationStatusCounts[status],
    0,
  );
  const listingsTotal = OPPORTUNITY_STATUSES.reduce(
    (sum, status) => sum + opportunityCounts[status],
    0,
  );
  const applicationsTotal = APPLICATION_STATUSES.reduce(
    (sum, status) => sum + applicationCounts[status],
    0,
  );

  const llmConfig = getLlmConfig();

  return {
    stats: {
      users: roleCounts.user,
      organisationsTotal,
      organisationsPending,
      listingsTotal,
      listingsPublished: opportunityCounts.published,
      applicationsTotal,
    },
    // Prisma loads the owner in a second query; an account deleted in between comes back without one.
    reviewQueue: reviewQueue.flatMap((profile) =>
      profile.user
        ? [
            {
              id: profile.id,
              businessName: profile.businessName,
              ownerName: profile.user.name,
              industry: profile.industry,
              location: profile.location,
              updatedAt: profile.updatedAt,
            },
          ]
        : [],
    ),
    breakdowns: {
      usersByRole: toBarItems(roleCounts, USER_ROLE_KEYS, USER_ROLE_LABELS),
      organisationsByStatus: toBarItems(
        organisationStatusCounts,
        ORGANISATION_STATUSES,
        ORGANISATION_STATUS_LABELS,
      ),
      listingsByStatus: toBarItems(
        opportunityCounts,
        OPPORTUNITY_STATUSES,
        OPPORTUNITY_STATUS_LABELS,
      ),
      applicationOutcomes: toBarItems(
        applicationCounts,
        APPLICATION_STATUSES,
        APPLICATION_STATUS_LABELS,
      ),
    },
    growth: {
      users: { last7: usersLast7, last30: usersLast30 },
      organisations: { last7: organisationsLast7, last30: organisationsLast30 },
      listings: { last7: listingsLast7, last30: listingsLast30 },
      applications: { last7: applicationsLast7, last30: applicationsLast30 },
    },
    ai: {
      analysisCount: analysisAgg._count._all,
      averageScore: analysisAgg._avg.score === null ? null : Math.round(analysisAgg._avg.score),
      provider: { kind: llmConfig.kind, model: llmConfig.model },
    },
  };
}
