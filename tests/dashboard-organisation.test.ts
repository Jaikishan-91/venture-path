import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  getOrganisationDashboard,
  mergeListingApplicantCounts,
  summarizeApplicantCounts,
  summarizeListingCounts,
  type ApplicationStatus,
} from "@/lib/dashboard/organisation";
import { getDb } from "@/lib/db";
import type { OpportunityStatus } from "@/lib/opportunity-schemas";
import { saveOrganisationProfile } from "@/lib/profiles";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "dashboard-organisation-test.venturepath.local";

const organisationInput = {
  businessName: "Acme Tools",
  description: "We make tools.",
  industry: "Manufacturing",
  location: "Pune",
  website: null,
};

async function createApprovedOrganisation() {
  const user = await getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test organisation",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "organisation",
    },
  });
  await saveOrganisationProfile(user.id, organisationInput);
  await getDb().organisationProfile.update({
    where: { userId: user.id },
    data: { status: "approved" },
  });
  return getDb().organisationProfile.findUniqueOrThrow({ where: { userId: user.id } });
}

async function createApplicant(name = "Test applicant") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name,
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "user",
      userProfile: {
        create: { institution: "IIT", course: "CSE", graduationYear: 2027, skills: [] },
      },
    },
    include: { userProfile: true },
  });
}

async function createListing(
  organisationProfileId: string,
  overrides: { title?: string; status?: OpportunityStatus; deadline?: Date | null } = {},
) {
  return getDb().opportunity.create({
    data: {
      organisationProfileId,
      type: "internship",
      title: overrides.title ?? "Marketing intern",
      description: "Social media.",
      skills: [],
      workMode: "remote",
      payType: "paid",
      payAmount: 10000,
      payPeriod: "month",
      status: overrides.status ?? "published",
      deadline: overrides.deadline ?? null,
    },
  });
}

async function createApplication(
  opportunityId: string,
  userProfileId: string,
  status: ApplicationStatus = "submitted",
) {
  return getDb().application.create({
    data: {
      opportunityId,
      userProfileId,
      note: null,
      resumeFileName: "cv.pdf",
      resumeStorageKey: randomUUID(),
      status,
    },
  });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("summarizeListingCounts", () => {
  it("zero-fills every status and sums matching rows", () => {
    expect(
      summarizeListingCounts([
        { status: "published", count: 3 },
        { status: "draft", count: 1 },
      ]),
    ).toEqual({ published: 3, drafts: 1, closed: 0 });
  });
});

describe("summarizeApplicantCounts", () => {
  it("excludes withdrawn from active applicants", () => {
    expect(
      summarizeApplicantCounts([
        { status: "submitted", count: 2 },
        { status: "accepted", count: 1 },
        { status: "rejected", count: 1 },
        { status: "withdrawn", count: 5 },
      ]),
    ).toEqual({ activeApplicants: 4, awaitingDecision: 2, accepted: 1, notSelected: 1 });
  });

  it("returns zeros for no rows", () => {
    expect(summarizeApplicantCounts([])).toEqual({
      activeApplicants: 0,
      awaitingDecision: 0,
      accepted: 0,
      notSelected: 0,
    });
  });
});

describe("mergeListingApplicantCounts", () => {
  it("merges per-listing counts and defaults listings with no applicants to zero", () => {
    const listings = [{ id: "a" }, { id: "b" }];
    const rows: { opportunityId: string; status: ApplicationStatus; count: number }[] = [
      { opportunityId: "a", status: "submitted", count: 2 },
      { opportunityId: "a", status: "accepted", count: 1 },
      { opportunityId: "a", status: "withdrawn", count: 3 },
      { opportunityId: "b", status: "rejected", count: 1 },
    ];
    expect(mergeListingApplicantCounts(listings, rows)).toEqual([
      { id: "a", total: 3, underReview: 2, accepted: 1, notSelected: 0 },
      { id: "b", total: 1, underReview: 0, accepted: 0, notSelected: 1 },
    ]);
  });
});

describe("getOrganisationDashboard", () => {
  it("counts own listings by status and own applicants excluding withdrawn", async () => {
    const org = await createApprovedOrganisation();
    const published = await createListing(org.id, { title: "Published role", status: "published" });
    await createListing(org.id, { title: "Draft role", status: "draft" });
    await createListing(org.id, { title: "Closed role", status: "closed" });

    const applicantA = await createApplicant("Applicant A");
    const applicantB = await createApplicant("Applicant B");
    const applicantC = await createApplicant("Applicant C");
    await createApplication(published.id, applicantA.userProfile!.id, "submitted");
    await createApplication(published.id, applicantB.userProfile!.id, "accepted");
    await createApplication(published.id, applicantC.userProfile!.id, "withdrawn");

    const dashboard = await getOrganisationDashboard(org.userId);

    expect(dashboard.listingCounts).toEqual({ published: 1, drafts: 1, closed: 1 });
    expect(dashboard.applicantCounts).toEqual({
      activeApplicants: 2,
      awaitingDecision: 1,
      accepted: 1,
      notSelected: 0,
    });

    const row = dashboard.listings.find((listing) => listing.id === published.id);
    expect(row).toMatchObject({ total: 2, underReview: 1, accepted: 1, notSelected: 0 });
  });

  it("never counts another organisation's listings or applications", async () => {
    const org = await createApprovedOrganisation();
    const other = await createApprovedOrganisation();
    await createListing(org.id, { title: "Mine", status: "published" });
    const otherListing = await createListing(other.id, { title: "Theirs", status: "published" });
    const applicant = await createApplicant();
    await createApplication(otherListing.id, applicant.userProfile!.id, "submitted");

    const dashboard = await getOrganisationDashboard(org.userId);

    expect(dashboard.listingCounts).toEqual({ published: 1, drafts: 0, closed: 0 });
    expect(dashboard.applicantCounts).toEqual({
      activeApplicants: 0,
      awaitingDecision: 0,
      accepted: 0,
      notSelected: 0,
    });
    expect(dashboard.listings.some((listing) => listing.title === "Theirs")).toBe(false);
    expect(dashboard.recentApplicants).toHaveLength(0);
  });

  it("reports no analyses, then the rounded average once some exist", async () => {
    const org = await createApprovedOrganisation();
    const listing = await createListing(org.id, { status: "published" });
    const empty = await getOrganisationDashboard(org.userId);
    expect(empty.avgScore).toEqual({ average: null, count: 0 });

    const a = await createApplicant("Scored A");
    const b = await createApplicant("Scored B");
    const appA = await createApplication(listing.id, a.userProfile!.id);
    const appB = await createApplication(listing.id, b.userProfile!.id);
    await getDb().analysis.create({ data: { applicationId: appA.id, score: 70 } });
    await getDb().analysis.create({ data: { applicationId: appB.id, score: 81 } });

    const withScores = await getOrganisationDashboard(org.userId);
    expect(withScores.avgScore).toEqual({ average: 76, count: 2 });
    const analyzed = withScores.recentApplicants.find((r) => r.applicantName === "Scored A");
    expect(analyzed?.score).toBe(70);
  });

  it("windows closing-soon at the inclusive 7-day India boundary and excludes drafts", async () => {
    const org = await createApprovedOrganisation();
    const now = new Date("2026-09-26T04:00:00Z"); // 09:30 IST, same India date
    const inToday = await createListing(org.id, {
      title: "Due today",
      status: "published",
      deadline: new Date("2026-09-26T00:00:00Z"),
    });
    const inDay7 = await createListing(org.id, {
      title: "Due day 7",
      status: "published",
      deadline: new Date("2026-10-03T00:00:00Z"),
    });
    await createListing(org.id, {
      title: "Due day 8",
      status: "published",
      deadline: new Date("2026-10-04T00:00:00Z"),
    });
    await createListing(org.id, {
      title: "Draft due today",
      status: "draft",
      deadline: new Date("2026-09-26T00:00:00Z"),
    });

    const dashboard = await getOrganisationDashboard(org.userId, now);
    const ids = dashboard.closingSoon.map((listing) => listing.id);
    expect(ids).toEqual([inToday.id, inDay7.id]);
  });
});
