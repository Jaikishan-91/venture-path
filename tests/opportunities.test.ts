import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import {
  changeOpportunityStatus,
  createOpportunity,
  deleteDraftOpportunity,
  getOwnOpportunity,
  updateOpportunity,
} from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import type { OrganisationStatus } from "@/lib/profile-schemas";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "opportunities-test.venturepath.local";

async function createOrganisation(status: OrganisationStatus = "approved") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test organisation",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "organisation",
      organisationProfile: {
        create: {
          businessName: "Acme",
          description: "Tools",
          industry: "Manufacturing",
          location: "Pune",
          status,
        },
      },
    },
  });
}

const listing: OpportunityInput = {
  type: "internship",
  title: "Marketing intern",
  description: "Social media.",
  skills: ["canva"],
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

async function createListing(userId: string) {
  const result = await createOpportunity(userId, listing);
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function setOrganisationStatus(userId: string, status: OrganisationStatus) {
  await getDb().organisationProfile.update({ where: { userId }, data: { status } });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("createOpportunity", () => {
  it("creates a draft for an approved organisation", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    expect((await getOwnOpportunity(organisation.id, id))?.status).toBe("draft");
  });

  it.each(["pending", "rejected"] as const)("refuses a %s organisation", async (status) => {
    const organisation = await createOrganisation(status);
    expect(await createOpportunity(organisation.id, listing)).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });

  it("refuses a user without an organisation profile", async () => {
    expect(await createOpportunity(randomUUID(), listing)).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });
});

describe("ownership", () => {
  it("another organisation can't read, edit, change or delete a listing", async () => {
    const owner = await createOrganisation();
    const other = await createOrganisation();
    const id = await createListing(owner.id);

    expect(await getOwnOpportunity(other.id, id)).toBeNull();
    expect(await updateOpportunity(other.id, id, { ...listing, title: "Hijacked" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await changeOpportunityStatus(other.id, id, "publish")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteDraftOpportunity(other.id, id)).toEqual({ ok: false, reason: "not_found" });
    expect(await getOwnOpportunity(owner.id, id)).toMatchObject({
      title: "Marketing intern",
      status: "draft",
    });
  });
});

describe("lifecycle", () => {
  it("publishes, closes and reopens", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);

    expect(await changeOpportunityStatus(organisation.id, id, "publish")).toEqual({
      ok: true,
      status: "published",
    });
    const published = await getOwnOpportunity(organisation.id, id);
    expect(published?.publishedAt).toBeInstanceOf(Date);

    expect(await changeOpportunityStatus(organisation.id, id, "close")).toEqual({
      ok: true,
      status: "closed",
    });
    expect((await getOwnOpportunity(organisation.id, id))?.closedAt).toBeInstanceOf(Date);

    expect(await changeOpportunityStatus(organisation.id, id, "reopen")).toEqual({
      ok: true,
      status: "published",
    });
    expect((await getOwnOpportunity(organisation.id, id))?.closedAt).toBeNull();
  });

  it("refuses transitions from the wrong state", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    expect(await changeOpportunityStatus(organisation.id, id, "close")).toEqual({
      ok: false,
      reason: "invalid_state",
    });
    expect(await changeOpportunityStatus(organisation.id, id, "reopen")).toEqual({
      ok: false,
      reason: "invalid_state",
    });
    await changeOpportunityStatus(organisation.id, id, "publish");
    expect(await changeOpportunityStatus(organisation.id, id, "publish")).toEqual({
      ok: false,
      reason: "invalid_state",
    });
  });

  it("keeps published listings editable", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    await changeOpportunityStatus(organisation.id, id, "publish");
    expect(
      await updateOpportunity(organisation.id, id, { ...listing, title: "Growth intern" }),
    ).toEqual({
      ok: true,
    });
    expect(await getOwnOpportunity(organisation.id, id)).toMatchObject({
      title: "Growth intern",
      status: "published",
    });
  });

  it("refuses publishing or reopening with a passed deadline", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    await getDb().opportunity.update({ where: { id }, data: { deadline: new Date("2000-01-01") } });
    expect(await changeOpportunityStatus(organisation.id, id, "publish")).toEqual({
      ok: false,
      reason: "deadline_passed",
    });

    await getDb().opportunity.update({ where: { id }, data: { status: "closed" } });
    expect(await changeOpportunityStatus(organisation.id, id, "reopen")).toEqual({
      ok: false,
      reason: "deadline_passed",
    });
  });

  it("lets a no-longer-approved organisation close but not publish, reopen or edit", async () => {
    const organisation = await createOrganisation();
    const published = await createListing(organisation.id);
    const draft = await createListing(organisation.id);
    await changeOpportunityStatus(organisation.id, published, "publish");
    await setOrganisationStatus(organisation.id, "pending");

    expect(await changeOpportunityStatus(organisation.id, draft, "publish")).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(await updateOpportunity(organisation.id, published, listing)).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(await changeOpportunityStatus(organisation.id, published, "close")).toEqual({
      ok: true,
      status: "closed",
    });
    expect(await changeOpportunityStatus(organisation.id, published, "reopen")).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(await deleteDraftOpportunity(organisation.id, draft)).toEqual({ ok: true });
  });
});

describe("deleteDraftOpportunity", () => {
  it("deletes drafts only", async () => {
    const organisation = await createOrganisation();
    const draft = await createListing(organisation.id);
    const published = await createListing(organisation.id);
    await changeOpportunityStatus(organisation.id, published, "publish");

    expect(await deleteDraftOpportunity(organisation.id, draft)).toEqual({ ok: true });
    expect(await getOwnOpportunity(organisation.id, draft)).toBeNull();
    expect(await deleteDraftOpportunity(organisation.id, published)).toEqual({
      ok: false,
      reason: "invalid_state",
    });
  });

  it("listings are deleted with their organisation", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    await getDb().user.delete({ where: { id: organisation.id } });
    expect(await getDb().opportunity.findUnique({ where: { id } })).toBeNull();
  });
});
