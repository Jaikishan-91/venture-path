import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import type { OrganisationProfileInput, UserProfileInput } from "@/lib/profile-schemas";
import { getOrganisationProfile, saveOrganisationProfile, saveUserProfile } from "@/lib/profiles";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "profiles-test.venturepath.local";

async function createUser(role: "user" | "organisation") {
  return getDb().user.create({
    data: { id: randomUUID(), name: "Test User", email: `${randomUUID()}@${EMAIL_DOMAIN}`, role },
  });
}

const profileInput: UserProfileInput = {
  institution: "IIT Delhi",
  course: "B.Tech CSE",
  graduationYear: 2027,
  skills: ["react"],
  bio: null,
  links: [],
};

const organisation: OrganisationProfileInput = {
  businessName: "Acme Tools",
  description: "We make tools.",
  industry: "Manufacturing",
  location: "Pune",
  website: null,
};

async function setStatus(userId: string, status: "approved" | "rejected") {
  await getDb().organisationProfile.update({ where: { userId }, data: { status } });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("saveUserProfile", () => {
  it("creates, then updates the same row", async () => {
    const user = await createUser("user");
    await saveUserProfile(user.id, profileInput);
    await saveUserProfile(user.id, { ...profileInput, skills: ["react", "sql"], bio: "Hi" });

    const rows = await getDb().userProfile.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ skills: ["react", "sql"], bio: "Hi" });
  });

  it("is deleted with its user", async () => {
    const user = await createUser("user");
    await saveUserProfile(user.id, profileInput);
    await getDb().user.delete({ where: { id: user.id } });
    expect(await getDb().userProfile.findUnique({ where: { userId: user.id } })).toBeNull();
  });
});

describe("saveOrganisationProfile", () => {
  it("creates a pending profile", async () => {
    const user = await createUser("organisation");
    expect(await saveOrganisationProfile(user.id, organisation)).toEqual({
      ok: true,
      status: "pending",
    });
    expect((await getOrganisationProfile(user.id))?.status).toBe("pending");
  });

  it("keeps an approved profile approved when nothing changed", async () => {
    const user = await createUser("organisation");
    await saveOrganisationProfile(user.id, organisation);
    await setStatus(user.id, "approved");

    expect(await saveOrganisationProfile(user.id, { ...organisation })).toEqual({
      ok: true,
      status: "approved",
    });
  });

  it("sends an approved profile back to pending when it changes", async () => {
    const user = await createUser("organisation");
    await saveOrganisationProfile(user.id, organisation);
    await setStatus(user.id, "approved");

    expect(await saveOrganisationProfile(user.id, { ...organisation, location: "Mumbai" })).toEqual(
      {
        ok: true,
        status: "pending",
      },
    );
    expect(await getOrganisationProfile(user.id)).toMatchObject({
      location: "Mumbai",
      status: "pending",
    });
  });

  it("resubmits a rejected profile on save", async () => {
    const user = await createUser("organisation");
    await saveOrganisationProfile(user.id, organisation);
    await setStatus(user.id, "rejected");

    expect(await saveOrganisationProfile(user.id, organisation)).toEqual({
      ok: true,
      status: "pending",
    });
  });

  it("only writes the given user's profile", async () => {
    const owner = await createUser("organisation");
    const other = await createUser("organisation");
    await saveOrganisationProfile(owner.id, organisation);
    await saveOrganisationProfile(other.id, { ...organisation, businessName: "Other Co" });

    expect((await getOrganisationProfile(owner.id))?.businessName).toBe("Acme Tools");
    expect((await getOrganisationProfile(other.id))?.businessName).toBe("Other Co");
  });
});
