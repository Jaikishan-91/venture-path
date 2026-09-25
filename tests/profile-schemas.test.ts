import { describe, expect, it } from "vitest";
import {
  maxGraduationYear,
  msmeProfileChanged,
  msmeProfileSchema,
  nextMsmeStatus,
  studentProfileSchema,
} from "@/lib/profile-schemas";

const student = {
  institution: "  IIT Delhi ",
  course: "B.Tech CSE",
  graduationYear: "2027",
  skills: "React, typescript , react,, SQL",
  bio: "",
  links: "https://github.com/someone\r\n\nhttps://linkedin.com/in/someone",
};

const msme = {
  businessName: "Acme Tools",
  description: "We make tools.",
  industry: "Manufacturing",
  location: "Pune",
  website: "",
};

describe("studentProfileSchema", () => {
  it("normalises form input", () => {
    expect(studentProfileSchema.parse(student)).toEqual({
      institution: "IIT Delhi",
      course: "B.Tech CSE",
      graduationYear: 2027,
      skills: ["react", "typescript", "sql"],
      bio: null,
      links: ["https://github.com/someone", "https://linkedin.com/in/someone"],
    });
  });

  it("accepts empty skills and links", () => {
    const parsed = studentProfileSchema.parse({ ...student, skills: "", links: "" });
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
    expect(studentProfileSchema.safeParse({ ...student, ...override }).success).toBe(false);
  });
});

describe("msmeProfileSchema", () => {
  it("turns an empty website into null", () => {
    expect(msmeProfileSchema.parse(msme).website).toBeNull();
  });

  it("accepts an https website", () => {
    expect(msmeProfileSchema.parse({ ...msme, website: "https://acme.in" }).website).toBe(
      "https://acme.in",
    );
  });

  it.each([
    ["missing business name", { businessName: "" }],
    ["missing description", { description: " " }],
    ["javascript website", { website: "javascript:alert(1)" }],
    ["ftp website", { website: "ftp://acme.in" }],
  ])("rejects %s", (_name, override) => {
    expect(msmeProfileSchema.safeParse({ ...msme, ...override }).success).toBe(false);
  });

  it("ignores a status field in the input", () => {
    expect(msmeProfileSchema.parse({ ...msme, status: "approved" })).not.toHaveProperty("status");
  });
});

describe("msmeProfileChanged", () => {
  const base = msmeProfileSchema.parse(msme);

  it("is false for identical values", () => {
    expect(msmeProfileChanged(base, { ...base })).toBe(false);
  });

  it("is true when any reviewed field differs", () => {
    expect(msmeProfileChanged(base, { ...base, location: "Mumbai" })).toBe(true);
    expect(msmeProfileChanged(base, { ...base, website: "https://acme.in" })).toBe(true);
  });
});

describe("nextMsmeStatus", () => {
  it.each([
    [null, false, "pending"],
    ["pending", false, "pending"],
    ["pending", true, "pending"],
    ["approved", false, "approved"],
    ["approved", true, "pending"],
    ["rejected", false, "pending"],
    ["rejected", true, "pending"],
  ] as const)("%s with changed=%s gives %s", (current, changed, expected) => {
    expect(nextMsmeStatus(current, changed)).toBe(expected);
  });
});
