import "server-only";
import type { UserProfile } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import type { WorkMode } from "@/lib/opportunity-schemas";
import { getUserProfile } from "@/lib/profiles";
import { recommendOpportunities } from "@/lib/recommendations";
import { visibleOpportunityWhere } from "@/lib/search";
import { daysAgo, indiaDateRange } from "./dates";
import type { ApplicationStatus } from "./statuses";

export type ProfileCompleteness = { percent: number; missing: string[] };

/** What's left before a profile counts as complete. Institution/course/year are schema-required, so
 * only the optional-in-practice fields are checked here. Pure, for tests. */
const COMPLETENESS_CHECKS: { label: string; check: (profile: UserProfile) => boolean }[] = [
  { label: "Add at least one skill", check: (profile) => profile.skills.length > 0 },
  { label: "Add a short bio", check: (profile) => Boolean(profile.bio && profile.bio.trim()) },
  {
    label: "Add a link (portfolio, LinkedIn, GitHub…)",
    check: (profile) => profile.links.length > 0,
  },
];

export function profileCompleteness(profile: UserProfile | null): ProfileCompleteness {
  if (!profile) return { percent: 0, missing: COMPLETENESS_CHECKS.map((item) => item.label) };
  const missing = COMPLETENESS_CHECKS.filter((item) => !item.check(profile)).map(
    (item) => item.label,
  );
  const percent = Math.round(
    ((COMPLETENESS_CHECKS.length - missing.length) / COMPLETENESS_CHECKS.length) * 100,
  );
  return { percent, missing };
}

export type OpportunityCard = {
  id: string;
  title: string;
  businessName: string;
  workMode: WorkMode;
  city: string | null;
  deadline: Date | null;
  /** Skill match 0–100, only on recommendations. */
  match?: number;
};

export type RecentApplication = {
  id: string;
  status: ApplicationStatus;
  appliedAt: Date;
  opportunityId: string;
  opportunityTitle: string;
  businessName: string;
};

export type ApplicationCounts = {
  total: number;
  submitted: number;
  accepted: number;
  rejected: number;
};

/** Zero-filled counts from a `groupBy(["status"])` result. Pure, for tests. */
export function summarizeApplicationCounts(
  rows: { status: string; _count: { _all: number } }[],
): ApplicationCounts {
  const counts: ApplicationCounts = { total: 0, submitted: 0, accepted: 0, rejected: 0 };
  for (const row of rows) {
    counts.total += row._count._all;
    if (row.status === "submitted") counts.submitted += row._count._all;
    else if (row.status === "accepted") counts.accepted += row._count._all;
    else if (row.status === "rejected") counts.rejected += row._count._all;
  }
  return counts;
}

/** Drops opportunities the user already applied to and caps the list. Pure, for tests. */
export function excludeApplied<T extends { id: string }>(
  items: T[],
  appliedIds: Set<string>,
  take: number,
): T[] {
  return items.filter((item) => !appliedIds.has(item.id)).slice(0, take);
}

const OPPORTUNITY_CARD_SELECT = {
  id: true,
  title: true,
  workMode: true,
  city: true,
  deadline: true,
  organisationProfile: { select: { businessName: true } },
} as const;

type OpportunityCardRow = {
  id: string;
  title: string;
  workMode: WorkMode;
  city: string | null;
  deadline: Date | null;
  organisationProfile: { businessName: string };
};

/**
 * Prisma loads relations in a second query, so a row whose owner was deleted in between comes back
 * without it despite the required relation. Such rows are dropped rather than crashing the page.
 */
const hasOrganisation = (row: { organisationProfile: unknown }) => row.organisationProfile != null;

const toCard = (row: OpportunityCardRow): OpportunityCard => ({
  id: row.id,
  title: row.title,
  businessName: row.organisationProfile.businessName,
  workMode: row.workMode,
  city: row.city,
  deadline: row.deadline,
});

const RECOMMENDED_TAKE = 4;
const CLOSING_SOON_TAKE = 5;
const RECENT_APPLICATIONS_TAKE = 5;
const NEW_THIS_WEEK_DAYS = 7;
const CLOSING_SOON_DAYS = 7;

/**
 * Recommended by skills (ADR-033: resume skills, else profile skills) or, when there are none or
 * the ranking fails, the latest listings. Applied-to listings are excluded either way.
 */
async function getRecommended(
  userId: string,
  appliedIds: Set<string>,
): Promise<{ title: string; items: OpportunityCard[] }> {
  try {
    const { items } = await recommendOpportunities(userId, RECOMMENDED_TAKE);
    if (items.length > 0) {
      return {
        title: "Recommended for you",
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          businessName: item.businessName,
          workMode: item.workMode,
          city: item.city,
          deadline: item.deadline,
          match: item.match,
        })),
      };
    }
  } catch (err) {
    getLogger().warn({ err }, "recommended opportunities failed; falling back to latest");
  }

  const latest = await getDb().opportunity.findMany({
    where: { ...visibleOpportunityWhere(), id: { notIn: [...appliedIds] } },
    orderBy: { publishedAt: "desc" },
    take: RECOMMENDED_TAKE,
    select: OPPORTUNITY_CARD_SELECT,
  });
  return { title: "Latest opportunities", items: latest.filter(hasOrganisation).map(toCard) };
}

export type UserDashboard = {
  newThisWeek: number;
  applicationCounts: ApplicationCounts;
  profile: UserProfile | null;
  completeness: ProfileCompleteness;
  recommendedTitle: string;
  recommended: OpportunityCard[];
  closingSoon: (OpportunityCard & { applied: boolean })[];
  recentApplications: RecentApplication[];
};

/** All data for the user dashboard. Every query is scoped to `userId`, except the
 * public-listing counts which only ever read visible (published, approved, open) opportunities. */
export async function getUserDashboard(userId: string, now = new Date()): Promise<UserDashboard> {
  const db = getDb();
  const closingRange = indiaDateRange(CLOSING_SOON_DAYS, now);

  const [profile, newThisWeek, statusRows, appliedRows, closingSoonRows, recentRows] =
    await Promise.all([
      getUserProfile(userId),
      db.opportunity.count({
        where: {
          ...visibleOpportunityWhere(),
          publishedAt: { gte: daysAgo(NEW_THIS_WEEK_DAYS, now) },
        },
      }),
      db.application.groupBy({
        by: ["status"],
        where: { userProfile: { userId } },
        _count: { _all: true },
      }),
      db.application.findMany({
        where: { userProfile: { userId } },
        select: { opportunityId: true },
      }),
      db.opportunity.findMany({
        where: {
          ...visibleOpportunityWhere(),
          deadline: { gte: closingRange.from, lte: closingRange.to },
        },
        orderBy: { deadline: "asc" },
        take: CLOSING_SOON_TAKE,
        select: OPPORTUNITY_CARD_SELECT,
      }),
      db.application.findMany({
        where: { userProfile: { userId } },
        orderBy: { appliedAt: "desc" },
        take: RECENT_APPLICATIONS_TAKE,
        select: {
          id: true,
          status: true,
          appliedAt: true,
          opportunity: {
            select: {
              id: true,
              title: true,
              organisationProfile: { select: { businessName: true } },
            },
          },
        },
      }),
    ]);

  const appliedIds = new Set(appliedRows.map((row) => row.opportunityId));
  const { title: recommendedTitle, items: recommended } = await getRecommended(userId, appliedIds);

  return {
    newThisWeek,
    applicationCounts: summarizeApplicationCounts(statusRows),
    profile,
    completeness: profileCompleteness(profile),
    recommendedTitle,
    recommended,
    closingSoon: closingSoonRows.filter(hasOrganisation).map((row) => ({
      ...toCard(row),
      applied: appliedIds.has(row.id),
    })),
    recentApplications: recentRows
      .filter((row) => row.opportunity != null && hasOrganisation(row.opportunity))
      .map((row) => ({
        id: row.id,
        status: row.status,
        appliedAt: row.appliedAt,
        opportunityId: row.opportunity.id,
        opportunityTitle: row.opportunity.title,
        businessName: row.opportunity.organisationProfile.businessName,
      })),
  };
}
