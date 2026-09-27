import { describe, expect, it } from "vitest";
import { appliedRange, isFiltered, parseApplicantFilters } from "@/lib/applicant-filters";

describe("parseApplicantFilters", () => {
  it("defaults to no filters, sorted by score", () => {
    expect(parseApplicantFilters({})).toEqual({
      minScore: null,
      applied: null,
      from: null,
      to: null,
      sort: "score",
      stage: null,
    });
  });

  it("accepts known values", () => {
    expect(parseApplicantFilters({ minScore: "70", applied: "7d", sort: "oldest" })).toEqual({
      minScore: 70,
      applied: "7d",
      from: null,
      to: null,
      sort: "oldest",
      stage: null,
    });
  });

  it("ignores unknown or invalid values instead of failing", () => {
    expect(
      parseApplicantFilters({ minScore: "42", applied: "1y", sort: "name", from: "2026-02-30" }),
    ).toEqual({ minScore: null, applied: null, from: null, to: null, sort: "score", stage: null });
  });

  it("accepts a stage id or 'applied', and treats anything else as no filter", () => {
    expect(parseApplicantFilters({ stage: "applied" }).stage).toBe("applied");
    const uuid = "11111111-1111-1111-1111-111111111111";
    expect(parseApplicantFilters({ stage: uuid }).stage).toBe(uuid);
    expect(parseApplicantFilters({ stage: "all" }).stage).toBeNull();
    expect(parseApplicantFilters({ stage: "not-a-uuid" }).stage).toBeNull();
    expect(parseApplicantFilters({}).stage).toBeNull();
  });

  it("keeps dates only for a custom range, swapping a reversed one", () => {
    expect(
      parseApplicantFilters({ applied: "custom", from: "2026-09-20", to: "2026-09-10" }),
    ).toMatchObject({ applied: "custom", from: "2026-09-10", to: "2026-09-20" });
    expect(parseApplicantFilters({ applied: "7d", from: "2026-09-10" })).toMatchObject({
      from: null,
    });
    expect(parseApplicantFilters({ applied: "custom" }).applied).toBeNull();
  });

  it("uses the first value of repeated parameters", () => {
    expect(parseApplicantFilters({ minScore: ["85", "50"] }).minScore).toBe(85);
  });
});

describe("appliedRange", () => {
  const now = new Date("2026-09-26T12:00:00Z");

  it("is null without a time filter", () => {
    expect(appliedRange(parseApplicantFilters({}), now)).toBeNull();
  });

  it("counts rolling windows back from now", () => {
    expect(appliedRange(parseApplicantFilters({ applied: "24h" }), now)).toEqual({
      gte: new Date("2026-09-25T12:00:00Z"),
    });
    expect(appliedRange(parseApplicantFilters({ applied: "30d" }), now)?.gte).toEqual(
      new Date("2026-08-27T12:00:00Z"),
    );
  });

  it("covers whole India-time days for a custom range, end inclusive", () => {
    expect(
      appliedRange(
        parseApplicantFilters({ applied: "custom", from: "2026-09-10", to: "2026-09-12" }),
        now,
      ),
    ).toEqual({
      gte: new Date("2026-09-09T18:30:00Z"),
      lt: new Date("2026-09-12T18:30:00Z"),
    });
  });
});

describe("isFiltered", () => {
  it("is false for sort alone", () => {
    expect(isFiltered(parseApplicantFilters({ sort: "newest" }))).toBe(false);
    expect(isFiltered(parseApplicantFilters({ minScore: "50" }))).toBe(true);
  });

  it("is true when a stage filter is set", () => {
    expect(isFiltered(parseApplicantFilters({ stage: "applied" }))).toBe(true);
  });
});
