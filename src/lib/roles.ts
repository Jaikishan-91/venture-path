import { z } from "zod";

export const ROLES = ["student", "msme", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SIGNUP_ROLES = ["student", "msme"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export const signupRoleSchema = z.enum(SIGNUP_ROLES);

export const ONBOARDING_PATH = "/onboarding/role";

const HOME_PATHS: Record<Role, string> = {
  student: "/student",
  msme: "/msme",
  admin: "/admin",
};

export function homePathFor(role: Role | null | undefined): string {
  return role ? HOME_PATHS[role] : ONBOARDING_PATH;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
