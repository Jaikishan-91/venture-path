import { describe, expect, it } from "vitest";
import { daysAgo, indiaDateRange } from "@/lib/dashboard/dates";

describe("daysAgo", () => {
  it("subtracts whole days", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    expect(daysAgo(7, now).toISOString()).toBe("2026-09-19T12:00:00.000Z");
  });
});

describe("indiaDateRange", () => {
  it("starts on today's India date", () => {
    // 20:00 UTC is already the next day in India (UTC+5:30).
    const range = indiaDateRange(7, new Date("2026-09-26T20:00:00Z"));
    expect(range.from.toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("covers only today for zero days", () => {
    const range = indiaDateRange(0, new Date("2026-09-26T05:00:00Z"));
    expect(range.from).toEqual(range.to);
  });
});
