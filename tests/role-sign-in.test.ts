import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/client";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { signInWithRole } from "@/lib/role-sign-in";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "role-sign-in-test.venturepath.local";
const PASSWORD = "correct-horse-battery";

/** A verified email/password account with the given role (or none). */
async function account(role: Role | null) {
  const email = `${randomUUID()}@${EMAIL_DOMAIN}`;
  await getAuth().api.signUpEmail({ body: { name: "Test", email, password: PASSWORD } });
  await getDb().user.update({ where: { email }, data: { emailVerified: true, role } });
  return email;
}

const sessionCount = (email: string) => getDb().session.count({ where: { user: { email } } });

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("signInWithRole", () => {
  it("signs in on the page for the account's role", async () => {
    const email = await account("organisation");
    expect(await signInWithRole("organisation", email, PASSWORD)).toEqual({
      ok: true,
      role: "organisation",
    });
    expect(await sessionCount(email)).toBe(1);
  });

  it("refuses another role's page and leaves no session", async () => {
    const email = await account("organisation");
    expect(await signInWithRole("user", email, PASSWORD)).toEqual({
      ok: false,
      reason: "wrong_role",
      actualRole: "organisation",
    });
    expect(await signInWithRole("admin", email, PASSWORD)).toMatchObject({ reason: "wrong_role" });
    expect(await sessionCount(email)).toBe(0);
  });

  it("checks the password before revealing the role", async () => {
    const email = await account("organisation");
    expect(await signInWithRole("user", email, "wrong-password")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("gives an account without a role the page's role, but never admin", async () => {
    const email = await account(null);
    expect(await signInWithRole("admin", email, PASSWORD)).toEqual({
      ok: false,
      reason: "wrong_role",
      actualRole: null,
    });
    expect(await signInWithRole("user", email, PASSWORD)).toEqual({ ok: true, role: "user" });
    expect((await getDb().user.findUniqueOrThrow({ where: { email } })).role).toBe("user");
  });

  it("reports an unverified email", async () => {
    const email = `${randomUUID()}@${EMAIL_DOMAIN}`;
    await getAuth().api.signUpEmail({ body: { name: "Test", email, password: PASSWORD } });
    expect(await signInWithRole("user", email, PASSWORD)).toEqual({
      ok: false,
      reason: "unverified",
    });
  });

  it("never assigns the hiring_manager role, unlike user/organisation", async () => {
    const email = await account(null);
    expect(await signInWithRole("hiring_manager", email, PASSWORD)).toEqual({
      ok: false,
      reason: "wrong_role",
      actualRole: null,
    });
    expect((await getDb().user.findUniqueOrThrow({ where: { email } })).role).toBeNull();
  });

  it("signs a hiring manager in on their own page", async () => {
    const email = await account("hiring_manager");
    expect(await signInWithRole("hiring_manager", email, PASSWORD)).toEqual({
      ok: true,
      role: "hiring_manager",
    });
  });

  it("continues to the invite instead of refusing, when the account is eligible", async () => {
    const email = await account(null);
    const inviteToken = "some-invite-token";
    expect(await signInWithRole("hiring_manager", email, PASSWORD, undefined, inviteToken)).toEqual(
      { ok: false, reason: "continue_invite", inviteToken },
    );
    // Unlike a wrong-role refusal, the new session is kept.
    expect(await sessionCount(email)).toBe(1);
    expect((await getDb().user.findUniqueOrThrow({ where: { email } })).role).toBeNull();
  });

  it("also continues an already-hiring_manager account to the invite", async () => {
    const email = await account("hiring_manager");
    const inviteToken = "another-invite-token";
    expect(await signInWithRole("hiring_manager", email, PASSWORD, undefined, inviteToken)).toEqual(
      { ok: false, reason: "continue_invite", inviteToken },
    );
    expect(await sessionCount(email)).toBe(1);
  });

  it("still refuses a different role's account even with an invite token", async () => {
    const email = await account("organisation");
    expect(
      await signInWithRole("hiring_manager", email, PASSWORD, undefined, "some-token"),
    ).toEqual({ ok: false, reason: "wrong_role", actualRole: "organisation" });
    expect(await sessionCount(email)).toBe(0);
  });
});
