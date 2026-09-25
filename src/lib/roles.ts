import { z } from "zod";

export const ROLES = ["user", "organisation", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SIGNUP_ROLES = ["user", "organisation"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export const signupRoleSchema = z.enum(SIGNUP_ROLES);

export const ONBOARDING_PATH = "/onboarding/role";

const HOME_PATHS: Record<Role, string> = {
  user: "/user",
  organisation: "/organisation",
  admin: "/admin",
};

export function homePathFor(role: Role | null | undefined): string {
  return role ? HOME_PATHS[role] : ONBOARDING_PATH;
}

export const ROLE_LABELS: Record<Role, string> = {
  user: "user",
  organisation: "organisation",
  admin: "admin",
};

/** Each role signs in on its own page (ADR-026). Admins have no sign-up page. */
export const SIGN_IN_PATHS: Record<Role, string> = {
  user: "/sign-in",
  organisation: "/organisation/sign-in",
  admin: "/admin/sign-in",
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
  return SIGN_IN_PATHS.user;
}

/** Sign-in and sign-up pages live inside protected areas but must stay public. */
export function isAuthPage(pathname: string): boolean {
  return /\/sign-(in|up)$/.test(pathname);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
