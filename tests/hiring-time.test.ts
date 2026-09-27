import { describe, expect, it } from "vitest";
import { formatIndiaDateTime, indiaLocalToUtc, utcToIndiaLocal } from "@/lib/hiring/time";

describe("indiaLocalToUtc", () => {
  it("subtracts the +05:30 offset", () => {
    expect(indiaLocalToUtc("2026-10-05T15:30")?.toISOString()).toBe("2026-10-05T10:00:00.000Z");
    expect(indiaLocalToUtc("2026-10-05T02:00")?.toISOString()).toBe("2026-10-04T20:30:00.000Z");
  });

  it("rejects malformed and impossible values", () => {
    expect(indiaLocalToUtc("2026-10-05 15:30")).toBeNull();
    expect(indiaLocalToUtc("2026-02-30T10:00")).toBeNull();
    expect(indiaLocalToUtc("2026-10-05T24:00")).toBeNull();
    expect(indiaLocalToUtc("")).toBeNull();
  });

  it("round-trips with utcToIndiaLocal", () => {
    const local = "2026-12-31T23:45";
    expect(utcToIndiaLocal(indiaLocalToUtc(local)!)).toBe(local);
  });
});

describe("formatIndiaDateTime", () => {
  it("shows India time with the zone", () => {
    expect(formatIndiaDateTime(new Date("2026-10-05T10:00:00Z"))).toMatch(/3:30\s?pm IST$/i);
  });
});
