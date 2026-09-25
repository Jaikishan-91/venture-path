import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATH,
  homePathFor,
  isAuthPage,
  isRole,
  signInPathForArea,
  signupRoleSchema,
} from "@/lib/roles";

describe("signupRoleSchema", () => {
  it("accepts user and organisation", () => {
    expect(signupRoleSchema.parse("user")).toBe("user");
    expect(signupRoleSchema.parse("organisation")).toBe("organisation");
  });

  it("rejects admin and unknown values", () => {
    expect(signupRoleSchema.safeParse("admin").success).toBe(false);
    expect(signupRoleSchema.safeParse("owner").success).toBe(false);
    expect(signupRoleSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("homePathFor", () => {
  it("maps each role to its home page", () => {
    expect(homePathFor("user")).toBe("/user");
    expect(homePathFor("organisation")).toBe("/organisation");
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

describe("signInPathForArea", () => {
  it("sends each protected area to its own sign-in page", () => {
    expect(signInPathForArea("/organisation")).toBe("/organisation/sign-in");
    expect(signInPathForArea("/organisation/opportunities/new")).toBe("/organisation/sign-in");
    expect(signInPathForArea("/admin/settings")).toBe("/admin/sign-in");
    expect(signInPathForArea("/user/applications")).toBe("/sign-in");
    expect(signInPathForArea("/dashboard")).toBe("/sign-in");
    expect(signInPathForArea("/organisations-fake")).toBe("/sign-in");
  });
});

describe("isAuthPage", () => {
  it("lets sign-in and sign-up pages through the proxy", () => {
    expect(isAuthPage("/organisation/sign-in")).toBe(true);
    expect(isAuthPage("/organisation/sign-up")).toBe(true);
    expect(isAuthPage("/admin/sign-in")).toBe(true);
    expect(isAuthPage("/organisation/profile")).toBe(false);
    expect(isAuthPage("/admin/sign-in/extra")).toBe(false);
  });
});
