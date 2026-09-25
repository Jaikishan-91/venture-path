import { describe, expect, it } from "vitest";
import {
  maxGraduationYear,
  organisationProfileChanged,
  organisationProfileSchema,
  nextOrganisationStatus,
  userProfileSchema,
} from "@/lib/profile-schemas";

const user = {
  institution: "  IIT Delhi ",
  course: "B.Tech CSE",
  graduationYear: "2027",
  skills: "React, typescript , react,, SQL",
  bio: "",
  links: "https://github.com/someone\r\n\nhttps://linkedin.com/in/someone",
};

const organisation = {
  businessName: "Acme Tools",
  description: "We make tools.",
  industry: "Manufacturing",
  location: "Pune",
  website: "",
};

describe("userProfileSchema", () => {
  it("normalises form input", () => {
    expect(userProfileSchema.parse(user)).toEqual({
      institution: "IIT Delhi",
      course: "B.Tech CSE",
      graduationYear: 2027,
      skills: ["react", "typescript", "sql"],
      bio: null,
      links: ["https://github.com/someone", "https://linkedin.com/in/someone"],
    });
  });

  it("accepts empty skills and links", () => {
    const parsed = userProfileSchema.parse({ ...user, skills: "", links: "" });
    expect(parsed.skills).toEqual([]);
    expect(parsed.links).toEqual([]);
  });

  it.each([
    ["missing institution", { institution: "  " }],
    ["year too early", { graduationYear: "1949" }],
    ["year too late", { graduationYear: String(maxGraduationYear() + 1) }],
    ["year not a number", { graduationYear: "soon" }],
    ["too many skills", { skills: Array.from({ length: 21 }, (_, i) => `s${i}`).join(",") }],
    ["skill too long", { skills: "x".repeat(41) }],
    [
      "too many links",
      { links: Array.from({ length: 6 }, (_, i) => `https://a${i}.com`).join("\n") },
    ],
    ["javascript link", { links: "javascript:alert(1)" }],
    ["link without protocol", { links: "github.com/someone" }],
    ["bio too long", { bio: "x".repeat(1001) }],
  ])("rejects %s", (_name, override) => {
    expect(userProfileSchema.safeParse({ ...user, ...override }).success).toBe(false);
  });
});

describe("organisationProfileSchema", () => {
  it("turns an empty website into null", () => {
    expect(organisationProfileSchema.parse(organisation).website).toBeNull();
  });

  it("accepts an https website", () => {
    expect(
      organisationProfileSchema.parse({ ...organisation, website: "https://acme.in" }).website,
    ).toBe("https://acme.in");
  });

  it.each([
    ["missing business name", { businessName: "" }],
    ["missing description", { description: " " }],
    ["javascript website", { website: "javascript:alert(1)" }],
    ["ftp website", { website: "ftp://acme.in" }],
  ])("rejects %s", (_name, override) => {
    expect(organisationProfileSchema.safeParse({ ...organisation, ...override }).success).toBe(
      false,
    );
  });

  it("ignores a status field in the input", () => {
    expect(
      organisationProfileSchema.parse({ ...organisation, status: "approved" }),
    ).not.toHaveProperty("status");
  });
});

describe("organisationProfileChanged", () => {
  const base = organisationProfileSchema.parse(organisation);

  it("is false for identical values", () => {
    expect(organisationProfileChanged(base, { ...base })).toBe(false);
  });

  it("is true when any reviewed field differs", () => {
    expect(organisationProfileChanged(base, { ...base, location: "Mumbai" })).toBe(true);
    expect(organisationProfileChanged(base, { ...base, website: "https://acme.in" })).toBe(true);
  });
});

describe("nextOrganisationStatus", () => {
  it.each([
    [null, false, "pending"],
    ["pending", false, "pending"],
    ["pending", true, "pending"],
    ["approved", false, "approved"],
    ["approved", true, "pending"],
    ["rejected", false, "pending"],
    ["rejected", true, "pending"],
  ] as const)("%s with changed=%s gives %s", (current, changed, expected) => {
    expect(nextOrganisationStatus(current, changed)).toBe(expected);
  });
});
