import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assignInitialRole } from "@/lib/user-roles";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "auth-test.venturepath.local";
const uniqueEmail = () => `${randomUUID()}@${EMAIL_DOMAIN}`;

async function createUser() {
  return getDb().user.create({
    data: { id: randomUUID(), name: "Test User", email: uniqueEmail() },
  });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("assignInitialRole", () => {
  it("sets the role of a user who has none", async () => {
    const user = await createUser();
    expect(await assignInitialRole(user.id, "student")).toBe(true);
    const stored = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.role).toBe("student");
  });

  it("never overwrites an existing role", async () => {
    const user = await createUser();
    await assignInitialRole(user.id, "msme");
    expect(await assignInitialRole(user.id, "student")).toBe(false);
    const stored = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.role).toBe("msme");
  });

  it("refuses admin and unknown roles", async () => {
    const user = await createUser();
    expect(await assignInitialRole(user.id, "admin")).toBe(false);
    expect(await assignInitialRole(user.id, "owner")).toBe(false);
    const stored = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.role).toBeNull();
  });
});

describe("Better Auth email sign-up", () => {
  const password = "correct-horse-battery";

  it("rejects a role supplied in the sign-up body", async () => {
    const email = uniqueEmail();
    const body = { name: "Sneaky", email, password, role: "admin" };
    await expect(getAuth().api.signUpEmail({ body })).rejects.toMatchObject({ statusCode: 400 });
    expect(await getDb().user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects sign-in until the email is verified", async () => {
    const email = uniqueEmail();
    await getAuth().api.signUpEmail({ body: { name: "Unverified", email, password } });

    await expect(getAuth().api.signInEmail({ body: { email, password } })).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
