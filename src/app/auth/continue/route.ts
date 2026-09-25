import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { getSession } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import { SIGN_IN_PATHS, homePathFor, signupRoleSchema } from "@/lib/roles";
import { assignInitialRole } from "@/lib/user-roles";

/**
 * Landing point after Google sign-in on a role's page (ADR-026). A new account takes that role;
 * an account with another role is signed out and sent back with an explanation.
 */
export async function GET(request: NextRequest) {
  const parsed = signupRoleSchema.safeParse(request.nextUrl.searchParams.get("as"));
  if (!parsed.success) redirect("/dashboard");
  const expected = parsed.data;

  const session = await getSession();
  if (!session) redirect(SIGN_IN_PATHS[expected]);

  await assignInitialRole(session.user.id, expected);
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
