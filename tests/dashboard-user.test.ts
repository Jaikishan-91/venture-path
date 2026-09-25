import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { indiaDateRange } from "@/lib/dashboard/dates";
import {
  excludeApplied,
  getUserDashboard,
  profileCompleteness,
  summarizeApplicationCounts,
} from "@/lib/dashboard/user";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import { applyToOpportunity } from "@/lib/applications";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "dashboard-user-test.venturepath.local";
const pdf = Buffer.from("%PDF-1.4\n");
const resume = { fileName: "cv.pdf", extension: "pdf" as const, bytes: pdf };

async function createUser(role: "user" | "organisation", approved = true) {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: `Test ${role}`,
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role,
      ...(role === "organisation"
        ? {
            organisationProfile: {
              create: {
                businessName: "Acme Co",
                description: "Tools",
                industry: "Manufacturing",
                location: "Pune",
                status: approved ? "approved" : "pending",
              },
            },
          }
        : {}),
    },
  });
}

async function createUserProfile(
  userId: string,
  overrides: Partial<{ skills: string[]; bio: string | null; links: string[] }> = {},
) {
  return getDb().userProfile.create({
    data: {
      userId,
      institution: "IIT Delhi",
      course: "B.Tech CSE",
      graduationYear: 2027,
      skills: overrides.skills ?? [],
      bio: overrides.bio ?? null,
      links: overrides.links ?? [],
    },
  });
}

const baseListing: OpportunityInput = {
  type: "internship",
  title: "Marketing intern",
  description: "Social media.",
  skills: [],
  workMode: "remote",
  city: null,
  payType: "paid",
  payAmount: 10000,
  payPeriod: "month",
  duration: null,
  deadline: null,
  requirements: null,
  experienceLevel: null,
  compensationMin: null,
  compensationMax: null,
};

/** Inserted directly: going through `createOpportunity` would load the embedding model, which
 * these tests don't need and which crashes when several test workers load it at once. */
async function publishedListing(organisationId: string, overrides: Partial<OpportunityInput> = {}) {
  const profile = await getDb().organisationProfile.findUniqueOrThrow({
    where: { userId: organisationId },
    select: { id: true },
  });
  const created = await getDb().opportunity.create({
    data: {
      ...baseListing,
      ...overrides,
      organisationProfileId: profile.id,
      status: "published",
      publishedAt: new Date(),
    },
  });
  return created.id;
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("profileCompleteness", () => {
  it("is 0% with no profile and lists everything missing", () => {
    const result = profileCompleteness(null);
    expect(result.percent).toBe(0);
    expect(result.missing).toHaveLength(3);
  });

  it("is 0% with a profile that has none of the optional fields", () => {
    const result = profileCompleteness({
      id: "p",
      userId: "u",
      institution: "IIT",
      course: "CSE",
      graduationYear: 2027,
      skills: [],
      bio: null,
      links: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.percent).toBe(0);
    expect(result.missing).toEqual([
      "Add at least one skill",
      "Add a short bio",
      "Add a link (portfolio, LinkedIn, GitHub…)",
    ]);
  });

  it("is 100% with skills, a bio and a link", () => {
    const result = profileCompleteness({
      id: "p",
      userId: "u",
      institution: "IIT",
      course: "CSE",
      graduationYear: 2027,
      skills: ["React"],
      bio: "Building things.",
      links: ["https://example.com"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result).toEqual({ percent: 100, missing: [] });
  });

  it("is partial with only some fields filled in", () => {
    const result = profileCompleteness({
      id: "p",
      userId: "u",
      institution: "IIT",
      course: "CSE",
      graduationYear: 2027,
      skills: ["React"],
      bio: "  ",
      links: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.percent).toBe(33);
    expect(result.missing).toEqual([
      "Add a short bio",
      "Add a link (portfolio, LinkedIn, GitHub…)",
    ]);
  });
});

describe("summarizeApplicationCounts", () => {
  it("zero-fills and totals a groupBy result", () => {
    const rows = [
      { status: "submitted", _count: { _all: 2 } },
      { status: "accepted", _count: { _all: 1 } },
      { status: "rejected", _count: { _all: 3 } },
      { status: "withdrawn", _count: { _all: 5 } },
    ];
    expect(summarizeApplicationCounts(rows)).toEqual({
      total: 11,
      submitted: 2,
      accepted: 1,
      rejected: 3,
    });
  });

  it("returns all zeros for no applications", () => {
    expect(summarizeApplicationCounts([])).toEqual({
      total: 0,
      submitted: 0,
      accepted: 0,
      rejected: 0,
    });
  });
});

describe("excludeApplied", () => {
  it("drops applied items and caps the result", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const applied = new Set(["b"]);
    expect(excludeApplied(items, applied, 2)).toEqual([{ id: "a" }, { id: "c" }]);
  });
});

describe("getUserDashboard: status counts", () => {
  it("counts a mix of application statuses for one user", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    await createUserProfile(user.id);

    const opportunityA = await publishedListing(organisation.id);
    const opportunityB = await publishedListing(organisation.id);
    const opportunityC = await publishedListing(organisation.id);

    const a = await applyToOpportunity(user.id, opportunityA, { ...resume, note: "" });
    const b = await applyToOpportunity(user.id, opportunityB, { ...resume, note: "" });
    await applyToOpportunity(user.id, opportunityC, { ...resume, note: "" });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    await getDb().application.update({ where: { id: a.id }, data: { status: "accepted" } });
    await getDb().application.update({ where: { id: b.id }, data: { status: "rejected" } });

    const dashboard = await getUserDashboard(user.id);
    expect(dashboard.applicationCounts).toEqual({
      total: 3,
      submitted: 1,
      accepted: 1,
      rejected: 1,
    });
  });
});

describe("getUserDashboard: closing soon window", () => {
  it("includes today and day 7, excludes day 8 and the past", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    await createUserProfile(user.id);

    // `visibleOpportunityWhere` compares against the real current date, so the window here must
    // be anchored to it too (not a fixed calendar date) for the visibility rule and the
    // closing-soon range to agree.
    const now = new Date();
    const range = indiaDateRange(7, now);
    const DAY_MS = 24 * 60 * 60 * 1000;

    const today = await publishedListing(organisation.id, { title: "Today", deadline: range.from });
    const day7 = await publishedListing(organisation.id, { title: "Day7", deadline: range.to });
    const day8 = await publishedListing(organisation.id, {
      title: "Day8",
      deadline: new Date(range.to.getTime() + DAY_MS),
    });
    const past = await publishedListing(organisation.id, {
      title: "Past",
      deadline: new Date(range.from.getTime() - DAY_MS),
    });

    const dashboard = await getUserDashboard(user.id, now);
    const ids = dashboard.closingSoon.map((o) => o.id);
    expect(ids).toContain(today);
    expect(ids).toContain(day7);
    expect(ids).not.toContain(day8);
    expect(ids).not.toContain(past);
  });
});

describe("getUserDashboard: fallback recommendations", () => {
  it("falls back to the latest listings, excluding ones the user already applied to", async () => {
    vi.resetModules();
    vi.doMock("@/lib/recommendations", () => ({
      recommendOpportunities: vi.fn().mockRejectedValue(new Error("embedding unavailable")),
    }));
    const { getUserDashboard: getUserDashboardMocked } = await import("@/lib/dashboard/user");

    const organisation = await createUser("organisation");
    const user = await createUser("user");
    // Skills present, so the (mocked, failing) recommendation path is taken before falling back.
    await createUserProfile(user.id, { skills: ["React"] });

    // Published last, so it would top the "latest" list if it weren't excluded. Other listings are
    // not asserted: concurrent test files publish their own and can push them out of the top 4.
    const applied = await publishedListing(organisation.id, { title: "Applied to" });
    await applyToOpportunity(user.id, applied, { ...resume, note: "" });

    const dashboard = await getUserDashboardMocked(user.id);
    expect(dashboard.recommendedTitle).toBe("Latest opportunities");
    expect(dashboard.recommended.map((o) => o.id)).not.toContain(applied);

    vi.doUnmock("@/lib/recommendations");
    vi.resetModules();
  });

  it("uses 'Latest opportunities' when the profile has no skills", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    await createUserProfile(user.id, { skills: [] });
    await publishedListing(organisation.id, { title: "Some job" });

    const dashboard = await getUserDashboard(user.id);
    expect(dashboard.recommendedTitle).toBe("Latest opportunities");
  });

  it("shows 'Complete your profile' state (no profile) with all items missing", async () => {
    const user = await createUser("user");
    const dashboard = await getUserDashboard(user.id);
    expect(dashboard.profile).toBeNull();
    expect(dashboard.completeness).toEqual({
      percent: 0,
      missing: [
        "Add at least one skill",
        "Add a short bio",
        "Add a link (portfolio, LinkedIn, GitHub…)",
      ],
    });
  });
});
