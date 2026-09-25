import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, type Session } from "./auth";
import { ONBOARDING_PATH, isRole, type Role } from "./roles";

export async function getSession(): Promise<Session | null> {
  return getAuth().api.getSession({ headers: await headers() });
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** Redirects users without a role to onboarding and users with another role to their own home. */
export async function requireRole(...allowed: Role[]): Promise<Session & { user: { role: Role } }> {
  const session = await requireSession();
  const role = session.user.role;
  if (!isRole(role)) redirect(ONBOARDING_PATH);
  if (!allowed.includes(role)) redirect("/dashboard");
  return session as Session & { user: { role: Role } };
}
