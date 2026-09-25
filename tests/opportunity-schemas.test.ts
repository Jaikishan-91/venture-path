import { describe, expect, it } from "vitest";
import {
  formatPay,
  isDeadlinePassed,
  opportunitySchema,
  todayInIndia,
} from "@/lib/opportunity-schemas";

const valid = {
  type: "internship",
  title: "Marketing intern",
  description: "Help run our social media.",
  skills: "Canva, instagram, canva",
  workMode: "hybrid",
  city: "Pune",
  payType: "paid",
  payAmount: "15000",
  payPeriod: "month",
  duration: "3 months",
  deadline: "",
};

const errorsFor = (override: Record<string, string>) => {
  const result = opportunitySchema.safeParse({ ...valid, ...override });
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("opportunitySchema", () => {
  it("normalises a valid listing", () => {
    expect(opportunitySchema.parse(valid)).toEqual({
      type: "internship",
      title: "Marketing intern",
      description: "Help run our social media.",
      skills: ["canva", "instagram"],
      workMode: "hybrid",
      city: "Pune",
      payType: "paid",
      payAmount: 15000,
      payPeriod: "month",
      duration: "3 months",
      deadline: null,
    });
  });

  it("allows remote work without a city", () => {
    expect(opportunitySchema.parse({ ...valid, workMode: "remote", city: "" }).city).toBeNull();
  });

  it("allows unpaid internships and drops pay details", () => {
    const parsed = opportunitySchema.parse({ ...valid, payType: "unpaid", payAmount: "5" });
    expect(parsed).toMatchObject({ payType: "unpaid", payAmount: null, payPeriod: null });
  });

  it("stores the deadline as a date", () => {
    const parsed = opportunitySchema.parse({ ...valid, deadline: "2099-12-31" });
    expect(parsed.deadline?.toISOString()).toBe("2099-12-31T00:00:00.000Z");
  });

  it("accepts today as the deadline", () => {
    expect(errorsFor({ deadline: todayInIndia() })).toEqual([]);
  });

  it.each([
    ["short title", { title: "Hey" }, "at least 5"],
    ["unknown type", { type: "job" }, "freelance or internship"],
    ["city missing for on-site", { workMode: "onsite", city: " " }, "city"],
    ["unpaid freelance", { type: "freelance", payType: "unpaid" }, "Freelance work must be paid"],
    ["missing amount", { payAmount: "" }, "whole amount"],
    ["decimal amount", { payAmount: "100.5" }, "whole amount"],
    ["zero amount", { payAmount: "0" }, "whole amount"],
    ["huge amount", { payAmount: "10000001" }, "whole amount"],
    ["missing period", { payPeriod: "" }, "how the pay is counted"],
    ["past deadline", { deadline: "2000-01-01" }, "past"],
    ["impossible date", { deadline: "2099-02-30" }, "valid deadline"],
    ["too many skills", { skills: Array.from({ length: 16 }, (_, i) => `s${i}`).join(",") }, "15"],
  ])("rejects %s", (_name, override, message) => {
    expect(errorsFor(override).join(" ")).toContain(message);
  });
});

describe("todayInIndia and isDeadlinePassed", () => {
  it("uses India time", () => {
    expect(todayInIndia(new Date("2026-09-25T19:00:00Z"))).toBe("2026-09-26");
  });

  it("treats the deadline day itself as open", () => {
    const deadline = new Date("2026-09-25T00:00:00Z");
    expect(isDeadlinePassed(deadline, "2026-09-25")).toBe(false);
    expect(isDeadlinePassed(deadline, "2026-09-26")).toBe(true);
    expect(isDeadlinePassed(null, "2026-09-26")).toBe(false);
  });
});

describe("formatPay", () => {
  it.each([
    [{ payType: "paid", payAmount: 15000, payPeriod: "month" }, "₹15,000 / month"],
    [{ payType: "paid", payAmount: 250, payPeriod: "hour" }, "₹250 / hour"],
    [{ payType: "paid", payAmount: 120000, payPeriod: "fixed" }, "₹1,20,000 fixed"],
    [{ payType: "unpaid", payAmount: null, payPeriod: null }, "Unpaid"],
  ] as const)("%o -> %s", (input, expected) => {
    expect(formatPay(input)).toBe(expected);
  });
});
