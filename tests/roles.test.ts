import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATH,
  googleContinueRoleSchema,
  homePathFor,
  isAuthPage,
  isGoogleContinueRole,
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
    expect(homePathFor("hiring_manager")).toBe("/hiring-manager");
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
    expect(signInPathForArea("/hiring-manager")).toBe("/hiring-manager/sign-in");
    expect(signInPathForArea("/hiring-manager/interviews")).toBe("/hiring-manager/sign-in");
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
    expect(isAuthPage("/hiring-manager/sign-in")).toBe(true);
    expect(isAuthPage("/organisation/profile")).toBe(false);
    expect(isAuthPage("/admin/sign-in/extra")).toBe(false);
  });
});

describe("googleContinueRoleSchema", () => {
  it("accepts user, organisation and hiring_manager", () => {
    expect(googleContinueRoleSchema.parse("user")).toBe("user");
    expect(googleContinueRoleSchema.parse("organisation")).toBe("organisation");
    expect(googleContinueRoleSchema.parse("hiring_manager")).toBe("hiring_manager");
  });

  it("rejects admin and unknown values", () => {
    expect(googleContinueRoleSchema.safeParse("admin").success).toBe(false);
    expect(googleContinueRoleSchema.safeParse("owner").success).toBe(false);
  });
});

describe("isGoogleContinueRole", () => {
  it("recognises user, organisation and hiring_manager but not admin", () => {
    expect(isGoogleContinueRole("user")).toBe(true);
    expect(isGoogleContinueRole("organisation")).toBe(true);
    expect(isGoogleContinueRole("hiring_manager")).toBe(true);
    expect(isGoogleContinueRole("admin")).toBe(false);
  });
});
