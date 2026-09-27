import { z } from "zod";

export const ROLES = ["user", "organisation", "admin", "hiring_manager"] as const;
export type Role = (typeof ROLES)[number];

export const SIGNUP_ROLES = ["user", "organisation"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export const signupRoleSchema = z.enum(SIGNUP_ROLES);

/** Roles that can use `/auth/continue` after Google sign-in: the signup roles, plus hiring
 * managers (who join by invite instead of signing up, but still sign in with Google). */
export const GOOGLE_CONTINUE_ROLES = [...SIGNUP_ROLES, "hiring_manager"] as const;
export type GoogleContinueRole = (typeof GOOGLE_CONTINUE_ROLES)[number];
export const googleContinueRoleSchema = z.enum(GOOGLE_CONTINUE_ROLES);

export function isGoogleContinueRole(value: Role): value is GoogleContinueRole {
  return (GOOGLE_CONTINUE_ROLES as readonly string[]).includes(value);
}

export const ONBOARDING_PATH = "/onboarding/role";

const HOME_PATHS: Record<Role, string> = {
  user: "/user",
  organisation: "/organisation",
  admin: "/admin",
  hiring_manager: "/hiring-manager",
};

export function homePathFor(role: Role | null | undefined): string {
  return role ? HOME_PATHS[role] : ONBOARDING_PATH;
}

export const ROLE_LABELS: Record<Role, string> = {
  user: "user",
  organisation: "organisation",
  admin: "admin",
  hiring_manager: "hiring manager",
};

/** Each role signs in on its own page (ADR-026). Admins and hiring managers have no sign-up page. */
export const SIGN_IN_PATHS: Record<Role, string> = {
  user: "/sign-in",
  organisation: "/organisation/sign-in",
  admin: "/admin/sign-in",
  hiring_manager: "/hiring-manager/sign-in",
};

export const SIGN_UP_PATHS: Record<SignupRole, string> = {
  user: "/sign-up",
  organisation: "/organisation/sign-up",
};

/** The sign-in page for a protected path: its area's page, or the user page. */
export function signInPathForArea(pathname: string): string {
  if (pathname === "/organisation" || pathname.startsWith("/organisation/")) {
    return SIGN_IN_PATHS.organisation;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return SIGN_IN_PATHS.admin;
  if (pathname === "/hiring-manager" || pathname.startsWith("/hiring-manager/")) {
    return SIGN_IN_PATHS.hiring_manager;
  }
  return SIGN_IN_PATHS.user;
}

/** Sign-in and sign-up pages live inside protected areas but must stay public. */
export function isAuthPage(pathname: string): boolean {
  return /\/sign-(in|up)$/.test(pathname);
}

export function isSignupRole(value: unknown): value is SignupRole {
  return typeof value === "string" && (SIGNUP_ROLES as readonly string[]).includes(value);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
