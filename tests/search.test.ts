import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { createOpportunity, changeOpportunityStatus } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import { getVisibleOpportunity, listVisibleCities, searchOpportunities } from "@/lib/search";

// Integration tests: real embeddings + the Docker Postgres. Results are filtered to this
// business, because the database is shared with the other tests.
const EMAIL_DOMAIN = "search-test.venturepath.local";
const token = randomUUID().slice(0, 8);
const businessName = `Search Co ${token}`;
const city = `Searchpur ${token}`;

async function createApprovedMsme() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Search MSME",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "msme",
      msmeProfile: {
        create: {
          businessName,
          description: "A test business.",
          industry: "Services",
          location: "Pune",
          status: "approved",
        },
      },
    },
  });
}

function listing(overrides: Partial<OpportunityInput> & { title: string }): OpportunityInput {
  return {
    type: "internship",
    description: "General help.",
    skills: [],
    workMode: "remote",
    city: null,
    payType: "paid",
    payAmount: 10000,
    payPeriod: "month",
    duration: null,
    deadline: null,
    ...overrides,
    title: `${overrides.title} ${token}`,
  };
}

async function publish(userId: string, input: OpportunityInput) {
  const created = await createOpportunity(userId, input);
  if (!created.ok) throw new Error(created.reason);
  const published = await changeOpportunityStatus(userId, created.id, "publish");
  if (!published.ok) throw new Error(published.reason);
  return created.id;
}

const ours = async (params: Parameters<typeof searchOpportunities>[0]) =>
  (await searchOpportunities(params)).results.filter((row) => row.businessName === businessName);

let msmeId: string;
let marketingId: string;
let logoId: string;
let draftId: string;

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("search", () => {
  it("embeds listings and applies the visibility rule", async () => {
    const msme = await createApprovedMsme();
    msmeId = msme.id;

    marketingId = await publish(
      msme.id,
      listing({
        title: "Social media marketing intern",
        description:
          "Plan and post content for our Instagram and Facebook pages and report on engagement.",
        skills: ["canva", "copywriting"],
        workMode: "hybrid",
        city,
      }),
    );
    logoId = await publish(
      msme.id,
      listing({
        type: "freelance",
        title: "Logo and brand identity",
        description: "Design a logo, colour palette and packaging labels for our bakery.",
        skills: ["illustrator", "branding"],
        payPeriod: "fixed",
        payAmount: 20000,
      }),
    );
    const draft = await createOpportunity(msme.id, listing({ title: "Secret draft" }));
    if (!draft.ok) throw new Error(draft.reason);
    draftId = draft.id;

    const expiredId = await publish(msme.id, listing({ title: "Expired campaign" }));
    await getDb().opportunity.update({
      where: { id: expiredId },
      data: { deadline: new Date("2000-01-01") },
    });

    const visible = await ours({ q: token, type: null, workMode: null, city: null, page: 1 });
    expect(visible.map((row) => row.id).sort()).toEqual([logoId, marketingId].sort());

    expect(await getVisibleOpportunity(marketingId)).toMatchObject({
      title: expect.stringContaining("Social media"),
      msmeProfile: { businessName },
    });
    expect(await getVisibleOpportunity(draftId)).toBeNull();
    expect(await getVisibleOpportunity(expiredId)).toBeNull();
  });

  it("hides listings when the MSME is no longer approved", async () => {
    await getDb().msmeProfile.update({ where: { userId: msmeId }, data: { status: "pending" } });
    expect(await ours({ q: token, type: null, workMode: null, city: null, page: 1 })).toEqual([]);
    expect(await getVisibleOpportunity(marketingId)).toBeNull();
    await getDb().msmeProfile.update({ where: { userId: msmeId }, data: { status: "approved" } });
  });

  it("finds a listing from related words that never appear in it", async () => {
    const results = await ours({
      q: "instagram content creation",
      type: null,
      workMode: null,
      city: null,
      page: 1,
    });
    expect(results.map((row) => row.id)).toContain(marketingId);
    expect(results.map((row) => row.id)).not.toContain(logoId);
  });

  it("ranks an exact title match above a merely related listing", async () => {
    const results = await ours({
      q: "logo",
      type: null,
      workMode: null,
      city: null,
      page: 1,
    });
    const ids = results.map((row) => row.id);
    expect(ids.indexOf(logoId)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(logoId)).toBeLessThan(
      ids.indexOf(marketingId) === -1 ? ids.length : ids.indexOf(marketingId),
    );
  });

  it("returns none of the test listings for an unrelated query", async () => {
    expect(
      await ours({ q: "cooking recipes", type: null, workMode: null, city: null, page: 1 }),
    ).toEqual([]);
  });

  it("filters by type, work mode and city", async () => {
    const base = { q: token, page: 1 as const, type: null, workMode: null, city: null };
    expect((await ours({ ...base, type: "freelance" })).map((row) => row.id)).toEqual([logoId]);
    expect((await ours({ ...base, workMode: "hybrid" })).map((row) => row.id)).toEqual([
      marketingId,
    ]);
    expect((await ours({ ...base, city })).map((row) => row.id)).toEqual([marketingId]);
    expect(await ours({ ...base, city: "Nowhere" })).toEqual([]);
  });

  it("lists only cities of visible listings", async () => {
    const cities = await listVisibleCities();
    expect(cities).toContain(city);
    expect(cities).not.toContain("Nowhere");
  });
});
