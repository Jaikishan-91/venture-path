import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import type { MsmeProfileInput, StudentProfileInput } from "@/lib/profile-schemas";
import { getMsmeProfile, saveMsmeProfile, saveStudentProfile } from "@/lib/profiles";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "profiles-test.venturepath.local";

async function createUser(role: "student" | "msme") {
  return getDb().user.create({
    data: { id: randomUUID(), name: "Test User", email: `${randomUUID()}@${EMAIL_DOMAIN}`, role },
  });
}

const student: StudentProfileInput = {
  institution: "IIT Delhi",
  course: "B.Tech CSE",
  graduationYear: 2027,
  skills: ["react"],
  bio: null,
  links: [],
};

const msme: MsmeProfileInput = {
  businessName: "Acme Tools",
  description: "We make tools.",
  industry: "Manufacturing",
  location: "Pune",
  website: null,
};

async function setStatus(userId: string, status: "approved" | "rejected") {
  await getDb().msmeProfile.update({ where: { userId }, data: { status } });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("saveStudentProfile", () => {
  it("creates, then updates the same row", async () => {
    const user = await createUser("student");
    await saveStudentProfile(user.id, student);
    await saveStudentProfile(user.id, { ...student, skills: ["react", "sql"], bio: "Hi" });

    const rows = await getDb().studentProfile.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ skills: ["react", "sql"], bio: "Hi" });
  });

  it("is deleted with its user", async () => {
    const user = await createUser("student");
    await saveStudentProfile(user.id, student);
    await getDb().user.delete({ where: { id: user.id } });
    expect(await getDb().studentProfile.findUnique({ where: { userId: user.id } })).toBeNull();
  });
});

describe("saveMsmeProfile", () => {
  it("creates a pending profile", async () => {
    const user = await createUser("msme");
    expect(await saveMsmeProfile(user.id, msme)).toEqual({ ok: true, status: "pending" });
    expect((await getMsmeProfile(user.id))?.status).toBe("pending");
  });

  it("keeps an approved profile approved when nothing changed", async () => {
    const user = await createUser("msme");
    await saveMsmeProfile(user.id, msme);
    await setStatus(user.id, "approved");

    expect(await saveMsmeProfile(user.id, { ...msme })).toEqual({ ok: true, status: "approved" });
  });

  it("sends an approved profile back to pending when it changes", async () => {
    const user = await createUser("msme");
    await saveMsmeProfile(user.id, msme);
    await setStatus(user.id, "approved");

    expect(await saveMsmeProfile(user.id, { ...msme, location: "Mumbai" })).toEqual({
      ok: true,
      status: "pending",
    });
    expect(await getMsmeProfile(user.id)).toMatchObject({ location: "Mumbai", status: "pending" });
  });

  it("resubmits a rejected profile on save", async () => {
    const user = await createUser("msme");
    await saveMsmeProfile(user.id, msme);
    await setStatus(user.id, "rejected");

    expect(await saveMsmeProfile(user.id, msme)).toEqual({ ok: true, status: "pending" });
  });

  it("only writes the given user's profile", async () => {
    const owner = await createUser("msme");
    const other = await createUser("msme");
    await saveMsmeProfile(owner.id, msme);
    await saveMsmeProfile(other.id, { ...msme, businessName: "Other Co" });

    expect((await getMsmeProfile(owner.id))?.businessName).toBe("Acme Tools");
    expect((await getMsmeProfile(other.id))?.businessName).toBe("Other Co");
  });
});
