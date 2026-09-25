"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getLogger } from "@/lib/logger";
import { signInWithRole, type RoleSignInResult } from "@/lib/role-sign-in";
import { SIGN_IN_PATHS, homePathFor, isRole, type Role } from "@/lib/roles";
import { flash } from "@/lib/flash";

export type SignInState =
  { status: "idle" } | { status: "error"; message: string; signInPath?: string };

const ACCOUNT_NAMES: Record<Role, string> = {
  user: "a user",
  organisation: "an organisation",
  admin: "an admin",
};

export async function signInAs(
  expected: Role,
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (!isRole(expected)) return { status: "error", message: "Unknown sign-in page." };
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { status: "error", message: "Enter your email and password." };
  }

  let result: RoleSignInResult;
  try {
    result = await signInWithRole(expected, email, password, await headers());
  } catch (err) {
    getLogger().error({ err, expected }, "sign-in failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  if (result.ok) {
    await flash("success", "Signed in. Welcome back.");
    redirect(homePathFor(result.role));
  }
  if (result.reason === "unverified") {
    return {
      status: "error",
      message: "Your email isn't verified yet. We've sent you a new verification link.",
    };
  }
  if (result.reason === "invalid")
    return { status: "error", message: "Invalid email or password." };

  // Wrong role: the session row is already deleted; drop the cookies set by this sign-in too.
  const { authCookies } = await getAuth().$context;
  const jar = await cookies();
  jar.delete(authCookies.sessionToken.name);
  jar.delete(authCookies.sessionData.name);

  const actual = result.actualRole;
  return {
    status: "error",
    message: actual
      ? `This is ${ACCOUNT_NAMES[actual]} account. Sign in on the ${actual} sign-in page.`
      : `This page is only for admin accounts.`,
    signInPath: actual ? SIGN_IN_PATHS[actual] : undefined,
  };
}
