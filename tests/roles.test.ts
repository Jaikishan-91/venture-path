import { describe, expect, it } from "vitest";
import { ONBOARDING_PATH, homePathFor, isRole, signupRoleSchema } from "@/lib/roles";

describe("signupRoleSchema", () => {
  it("accepts student and msme", () => {
    expect(signupRoleSchema.parse("student")).toBe("student");
    expect(signupRoleSchema.parse("msme")).toBe("msme");
  });

  it("rejects admin and unknown values", () => {
    expect(signupRoleSchema.safeParse("admin").success).toBe(false);
    expect(signupRoleSchema.safeParse("owner").success).toBe(false);
    expect(signupRoleSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("homePathFor", () => {
  it("maps each role to its home page", () => {
    expect(homePathFor("student")).toBe("/student");
    expect(homePathFor("msme")).toBe("/msme");
    expect(homePathFor("admin")).toBe("/admin");
  });

  it("sends users without a role to onboarding", () => {
    expect(homePathFor(null)).toBe(ONBOARDING_PATH);
    expect(homePathFor(undefined)).toBe(ONBOARDING_PATH);
  });
});

describe("isRole", () => {
  it("recognises only known roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
