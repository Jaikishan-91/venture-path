import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { countOrganisationsByStatus, reviewOrganisation } from "@/lib/organisation-review";
import { reviewInputSchema, type ReviewInput } from "@/lib/organisation-review-schema";
import { getOrganisationProfile, saveOrganisationProfile } from "@/lib/profiles";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "organisation-review-test.venturepath.local";

async function createUser(role: "organisation" | "admin") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: `Test ${role}`,
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role,
    },
  });
}

const organisation = {
  businessName: "Acme Tools",
  description: "We make tools.",
  industry: "Manufacturing",
  location: "Pune",
  website: null,
};

async function createPendingOrganisation() {
  const user = await createUser("organisation");
  await saveOrganisationProfile(user.id, organisation);
  return getDb().organisationProfile.findUniqueOrThrow({ where: { userId: user.id } });
}

const decide = (
  profile: { id: string; updatedAt: Date },
  decision: "approve" | "reject",
  reason = "Incomplete details",
): ReviewInput =>
  decision === "approve"
    ? { decision, profileId: profile.id, profileUpdatedAt: profile.updatedAt.toISOString() }
    : {
        decision,
        reason,
        profileId: profile.id,
        profileUpdatedAt: profile.updatedAt.toISOString(),
      };

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("reviewInputSchema", () => {
  const base = { profileId: "p1", profileUpdatedAt: new Date().toISOString() };

  it("accepts an approval without a reason", () => {
    expect(reviewInputSchema.safeParse({ ...base, decision: "approve" }).success).toBe(true);
  });

  it.each([
    ["missing reason", { decision: "reject" }],
    ["blank reason", { decision: "reject", reason: "   " }],
    ["reason too long", { decision: "reject", reason: "x".repeat(501) }],
    ["unknown decision", { decision: "maybe" }],
    ["bad timestamp", { decision: "approve", profileUpdatedAt: "yesterday" }],
  ])("rejects %s", (_name, override) => {
    expect(reviewInputSchema.safeParse({ ...base, ...override }).success).toBe(false);
  });
});

describe("reviewOrganisation", () => {
  it("approves: sets reviewer and time, clears any reason", async () => {
    const admin = await createUser("admin");
    const profile = await createPendingOrganisation();
    const rejected = await reviewOrganisation(admin.id, decide(profile, "reject"));
    expect(rejected).toEqual({ ok: true, status: "rejected" });

    const afterReject = await getDb().organisationProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(afterReject.rejectionReason).toBe("Incomplete details");

    expect(await reviewOrganisation(admin.id, decide(afterReject, "approve"))).toEqual({
      ok: true,
      status: "approved",
    });
    const stored = await getDb().organisationProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(stored).toMatchObject({
      status: "approved",
      reviewedById: admin.id,
      rejectionReason: null,
    });
    expect(stored.reviewedAt).toBeInstanceOf(Date);
  });

  it("can revoke an approval", async () => {
    const admin = await createUser("admin");
    const profile = await createPendingOrganisation();
    await reviewOrganisation(admin.id, decide(profile, "approve"));
    const approved = await getDb().organisationProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });

    expect(await reviewOrganisation(admin.id, decide(approved, "reject", "Fake business"))).toEqual(
      {
        ok: true,
        status: "rejected",
      },
    );
  });

  it("refuses a decision on a profile edited after the admin loaded it", async () => {
    const admin = await createUser("admin");
    const profile = await createPendingOrganisation();
    await saveOrganisationProfile(profile.userId, { ...organisation, location: "Mumbai" });

    expect(await reviewOrganisation(admin.id, decide(profile, "approve"))).toEqual({
      ok: false,
      reason: "changed",
    });
    expect((await getOrganisationProfile(profile.userId))?.status).toBe("pending");
  });

  it("refuses a repeated decision from a stale page", async () => {
    const admin = await createUser("admin");
    const profile = await createPendingOrganisation();
    await reviewOrganisation(admin.id, decide(profile, "approve"));
    expect(await reviewOrganisation(admin.id, decide(profile, "approve"))).toEqual({
      ok: false,
      reason: "changed",
    });
  });

  it("reports a missing profile", async () => {
    const admin = await createUser("admin");
    const ghost = { id: randomUUID(), updatedAt: new Date() };
    expect(await reviewOrganisation(admin.id, decide(ghost, "approve"))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("an organisation edit after approval still sends it back to pending", async () => {
    const admin = await createUser("admin");
    const profile = await createPendingOrganisation();
    await reviewOrganisation(admin.id, decide(profile, "approve"));

    expect(
      await saveOrganisationProfile(profile.userId, { ...organisation, industry: "Retail" }),
    ).toEqual({
      ok: true,
      status: "pending",
    });
  });

  it("keeps the review when the reviewing admin is deleted", async () => {
    const admin = await createUser("admin");
    const profile = await createPendingOrganisation();
    await reviewOrganisation(admin.id, decide(profile, "approve"));
    await getDb().user.delete({ where: { id: admin.id } });

    expect(
      await getDb().organisationProfile.findUniqueOrThrow({ where: { id: profile.id } }),
    ).toMatchObject({ status: "approved", reviewedById: null });
  });
});

describe("countOrganisationsByStatus", () => {
  it("returns a count for every status", async () => {
    const counts = await countOrganisationsByStatus();
    expect(Object.keys(counts).sort()).toEqual(["approved", "pending", "rejected"]);
  });
});
