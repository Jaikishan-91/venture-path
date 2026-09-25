import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { fillCounts, getAdminDashboard, toBarItems } from "@/lib/dashboard/admin";
import { clearLlmConfigCache } from "@/lib/llm/config";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "dashboard-admin-test.venturepath.local";
const savedEnv = { ...process.env };

async function createUser(role: "user" | "organisation" | "admin", createdAt = new Date()) {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: `Test ${role}`,
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role,
      createdAt,
    },
  });
}

async function createPendingOrganisation(updatedAt = new Date(), createdAt = updatedAt) {
  const user = await createUser("organisation", createdAt);
  const profile = await getDb().organisationProfile.create({
    data: {
      userId: user.id,
      businessName: `Test Org ${randomUUID().slice(0, 8)}`,
      description: "We make tools.",
      industry: "Manufacturing",
      location: "Pune",
      status: "pending",
      createdAt,
      updatedAt,
    },
  });
  return { user, profile };
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("fillCounts", () => {
  it("zero-fills every key and overlays the given counts", () => {
    expect(fillCounts(["a", "b", "c"] as const, [{ key: "b" as const, count: 5 }])).toEqual({
      a: 0,
      b: 5,
      c: 0,
    });
  });

  it("zero-fills all keys when no rows are given", () => {
    expect(fillCounts(["a", "b"] as const, [])).toEqual({ a: 0, b: 0 });
  });
});

describe("toBarItems", () => {
  it("orders and labels counts", () => {
    const items = toBarItems({ a: 1, b: 2 } as Record<"a" | "b", number>, ["b", "a"] as const, {
      a: "A",
      b: "B",
    });
    expect(items).toEqual([
      { label: "B", value: 2 },
      { label: "A", value: 1 },
    ]);
  });
});

describe("getAdminDashboard stats", () => {
  // Other test files add and delete rows concurrently, so global totals can move either way
  // between two reads. Check invariants of a single read instead of deltas across reads.
  it("returns consistent totals", async () => {
    await createUser("user");
    await createPendingOrganisation();
    const { stats, breakdowns } = await getAdminDashboard();

    const sum = (items: { value: number }[]) =>
      items.reduce((total, item) => total + item.value, 0);
    expect(stats.users).toBeGreaterThanOrEqual(1);
    expect(stats.organisationsPending).toBeGreaterThanOrEqual(1);
    expect(stats.organisationsPending).toBeLessThanOrEqual(stats.organisationsTotal);
    expect(sum(breakdowns.organisationsByStatus)).toBe(stats.organisationsTotal);
    expect(sum(breakdowns.listingsByStatus)).toBe(stats.listingsTotal);
    expect(stats.listingsPublished).toBeLessThanOrEqual(stats.listingsTotal);
    expect(sum(breakdowns.applicationOutcomes)).toBe(stats.applicationsTotal);
    expect(breakdowns.usersByRole.find((item) => item.label === "User")?.value).toBe(stats.users);
  });
});

describe("getAdminDashboard growth windows", () => {
  it("counts a user created 10 days ago in the 30-day window but not the 7-day window", async () => {
    // Far in the future, so rows other test files create concurrently fall outside both windows.
    const now = new Date("2100-01-31T00:00:00Z");
    const before = await getAdminDashboard(now);

    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    await createUser("user", tenDaysAgo);

    const after = await getAdminDashboard(now);
    expect(after.growth.users.last30).toBe(before.growth.users.last30 + 1);
    expect(after.growth.users.last7).toBe(before.growth.users.last7);
  });
});

describe("getAdminDashboard review queue", () => {
  it("orders oldest-first, includes a newly created pending organisation, and caps at 5", async () => {
    const { profile } = await createPendingOrganisation(new Date("2000-01-01T00:00:00Z"));

    const dashboard = await getAdminDashboard();
    expect(dashboard.reviewQueue.length).toBeLessThanOrEqual(5);
    expect(dashboard.reviewQueue[0].id).toBe(profile.id);
    expect(dashboard.reviewQueue[0].businessName).toBe(profile.businessName);
  });
});

describe("getAdminDashboard ai stats", () => {
  afterEach(() => {
    process.env = { ...savedEnv };
    clearLlmConfigCache();
  });

  it("exposes only kind/model, never apiKey or baseUrl, even when both are set", async () => {
    Object.assign(process.env, {
      LLM_PROVIDER: "openai",
      LLM_BASE_URL: "http://llm.test/v1",
      LLM_API_KEY: "super-secret-key",
      LLM_MODEL: "test-model",
    });
    clearLlmConfigCache();

    const dashboard = await getAdminDashboard();
    expect(Object.keys(dashboard.ai.provider).sort()).toEqual(["kind", "model"]);
    expect(dashboard.ai.provider).toEqual({ kind: "openai", model: "test-model" });
  });

  it("reports disabled when no provider is configured", async () => {
    Object.assign(process.env, { LLM_PROVIDER: "disabled" });
    clearLlmConfigCache();

    const dashboard = await getAdminDashboard();
    expect(dashboard.ai.provider.kind).toBe("disabled");
  });
});
