import { APIError } from "better-auth/api";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { getLogger } from "./logger";
import type { Role } from "./roles";
import { assignInitialRole } from "./user-roles";

export type RoleSignInResult =
  | { ok: true; role: Role }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "unverified" }
  | { ok: false; reason: "wrong_role"; actualRole: Role | null }
  /** An invite continuation (hiring managers only): keep the new session, go accept it instead. */
  | { ok: false; reason: "continue_invite"; inviteToken: string };

/**
 * Email/password sign-in on a role's own page (ADR-026). The password is checked first, so a
 * wrong password never reveals the account's role. An account without a role takes the page's
 * role (user or organisation) — hiring managers are never assigned here, only by `acceptInvite`.
 * A different role is refused and its new session is deleted, unless `inviteToken` is given and
 * the account is eligible to accept it (ADR-036), in which case the session is kept.
 */
export async function signInWithRole(
  expected: Role,
  email: string,
  password: string,
  headers?: Headers,
  inviteToken?: string,
): Promise<RoleSignInResult> {
  let result;
  try {
    result = await getAuth().api.signInEmail({
      body: { email, password, callbackURL: "/dashboard" },
      headers,
    });
  } catch (err) {
    if (err instanceof APIError && err.statusCode === 403)
      return { ok: false, reason: "unverified" };
    if (err instanceof APIError && err.statusCode === 401) return { ok: false, reason: "invalid" };
    throw err;
  }

  const userId = result.user.id;
  if (expected === "user" || expected === "organisation") {
    await assignInitialRole(userId, expected);
  }
  const { role } = await getDb().user.findUniqueOrThrow({
    where: { id: userId },
    select: { role: true },
  });

  if (
    expected === "hiring_manager" &&
    inviteToken &&
    (role === null || role === "hiring_manager")
  ) {
    return { ok: false, reason: "continue_invite", inviteToken };
  }

  if (role !== expected) {
    await getDb().session.deleteMany({ where: { token: result.token } });
    getLogger().info({ userId, expected, role }, "sign-in refused: wrong role for this page");
    return { ok: false, reason: "wrong_role", actualRole: role };
  }
  return { ok: true, role };
}
