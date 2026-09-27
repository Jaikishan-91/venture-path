import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { getSession } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import { SIGN_IN_PATHS, googleContinueRoleSchema, homePathFor } from "@/lib/roles";
import { assignInitialRole } from "@/lib/user-roles";

/**
 * Landing point after Google sign-in on a role's page (ADR-026). A new user/organisation account
 * takes that role; hiring managers are never assigned here (only `acceptInvite` writes that role).
 * An account with another role (or none, for hiring managers) is signed out and sent back with an
 * explanation.
 */
export async function GET(request: NextRequest) {
  const parsed = googleContinueRoleSchema.safeParse(request.nextUrl.searchParams.get("as"));
  if (!parsed.success) redirect("/dashboard");
  const expected = parsed.data;

  const session = await getSession();
  if (!session) redirect(SIGN_IN_PATHS[expected]);

  if (expected === "user" || expected === "organisation") {
    await assignInitialRole(session.user.id, expected);
  }
  const { role } = await getDb().user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (role !== expected) {
    getLogger().info(
      { userId: session.user.id, expected, role },
      "Google sign-in refused: wrong role",
    );
    await getAuth().api.signOut({ headers: await headers() });
    redirect(`${SIGN_IN_PATHS[expected]}?error=wrong-role`);
  }
  redirect(homePathFor(role));
}
