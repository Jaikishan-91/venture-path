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
import type { MsmeStatus } from "@/lib/profile-schemas";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "opportunities-test.venturepath.local";

async function createMsme(status: MsmeStatus = "approved") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test MSME",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "msme",
      msmeProfile: {
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
};

async function createListing(userId: string) {
  const result = await createOpportunity(userId, listing);
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function setMsmeStatus(userId: string, status: MsmeStatus) {
  await getDb().msmeProfile.update({ where: { userId }, data: { status } });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("createOpportunity", () => {
  it("creates a draft for an approved MSME", async () => {
    const msme = await createMsme();
    const id = await createListing(msme.id);
    expect((await getOwnOpportunity(msme.id, id))?.status).toBe("draft");
  });

  it.each(["pending", "rejected"] as const)("refuses a %s MSME", async (status) => {
    const msme = await createMsme(status);
    expect(await createOpportunity(msme.id, listing)).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });

  it("refuses a user without an MSME profile", async () => {
    expect(await createOpportunity(randomUUID(), listing)).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });
});

describe("ownership", () => {
  it("another MSME can't read, edit, change or delete a listing", async () => {
    const owner = await createMsme();
    const other = await createMsme();
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
    const msme = await createMsme();
    const id = await createListing(msme.id);

    expect(await changeOpportunityStatus(msme.id, id, "publish")).toEqual({
      ok: true,
      status: "published",
    });
    const published = await getOwnOpportunity(msme.id, id);
    expect(published?.publishedAt).toBeInstanceOf(Date);

    expect(await changeOpportunityStatus(msme.id, id, "close")).toEqual({
      ok: true,
      status: "closed",
    });
    expect((await getOwnOpportunity(msme.id, id))?.closedAt).toBeInstanceOf(Date);

    expect(await changeOpportunityStatus(msme.id, id, "reopen")).toEqual({
      ok: true,
      status: "published",
    });
    expect((await getOwnOpportunity(msme.id, id))?.closedAt).toBeNull();
  });

  it("refuses transitions from the wrong state", async () => {
    const msme = await createMsme();
    const id = await createListing(msme.id);
    expect(await changeOpportunityStatus(msme.id, id, "close")).toEqual({
      ok: false,
      reason: "invalid_state",
    });
    expect(await changeOpportunityStatus(msme.id, id, "reopen")).toEqual({
      ok: false,
      reason: "invalid_state",
    });
    await changeOpportunityStatus(msme.id, id, "publish");
    expect(await changeOpportunityStatus(msme.id, id, "publish")).toEqual({
      ok: false,
      reason: "invalid_state",
    });
  });

  it("keeps published listings editable", async () => {
    const msme = await createMsme();
    const id = await createListing(msme.id);
    await changeOpportunityStatus(msme.id, id, "publish");
    expect(await updateOpportunity(msme.id, id, { ...listing, title: "Growth intern" })).toEqual({
      ok: true,
    });
    expect(await getOwnOpportunity(msme.id, id)).toMatchObject({
      title: "Growth intern",
      status: "published",
    });
  });

  it("refuses publishing or reopening with a passed deadline", async () => {
    const msme = await createMsme();
    const id = await createListing(msme.id);
    await getDb().opportunity.update({ where: { id }, data: { deadline: new Date("2000-01-01") } });
    expect(await changeOpportunityStatus(msme.id, id, "publish")).toEqual({
      ok: false,
      reason: "deadline_passed",
    });

    await getDb().opportunity.update({ where: { id }, data: { status: "closed" } });
    expect(await changeOpportunityStatus(msme.id, id, "reopen")).toEqual({
      ok: false,
      reason: "deadline_passed",
    });
  });

  it("lets a no-longer-approved MSME close but not publish, reopen or edit", async () => {
    const msme = await createMsme();
    const published = await createListing(msme.id);
    const draft = await createListing(msme.id);
    await changeOpportunityStatus(msme.id, published, "publish");
    await setMsmeStatus(msme.id, "pending");

    expect(await changeOpportunityStatus(msme.id, draft, "publish")).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(await updateOpportunity(msme.id, published, listing)).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(await changeOpportunityStatus(msme.id, published, "close")).toEqual({
      ok: true,
      status: "closed",
    });
    expect(await changeOpportunityStatus(msme.id, published, "reopen")).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(await deleteDraftOpportunity(msme.id, draft)).toEqual({ ok: true });
  });
});

describe("deleteDraftOpportunity", () => {
  it("deletes drafts only", async () => {
    const msme = await createMsme();
    const draft = await createListing(msme.id);
    const published = await createListing(msme.id);
    await changeOpportunityStatus(msme.id, published, "publish");

    expect(await deleteDraftOpportunity(msme.id, draft)).toEqual({ ok: true });
    expect(await getOwnOpportunity(msme.id, draft)).toBeNull();
    expect(await deleteDraftOpportunity(msme.id, published)).toEqual({
      ok: false,
      reason: "invalid_state",
    });
  });

  it("listings are deleted with their MSME", async () => {
    const msme = await createMsme();
    const id = await createListing(msme.id);
    await getDb().user.delete({ where: { id: msme.id } });
    expect(await getDb().opportunity.findUnique({ where: { id } })).toBeNull();
  });
});
