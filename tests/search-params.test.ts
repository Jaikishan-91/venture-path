import { describe, expect, it } from "vitest";
import { browseHref, parseBrowseParams } from "@/lib/search-params";

describe("parseBrowseParams", () => {
  it("applies defaults", () => {
    expect(parseBrowseParams({})).toEqual({
      q: "",
      type: null,
      workMode: null,
      city: null,
      page: 1,
    });
  });

  it("keeps valid filters and trims them", () => {
    expect(
      parseBrowseParams({
        q: " design ",
        type: "freelance",
        workMode: "remote",
        city: " Pune ",
        page: "3",
      }),
    ).toEqual({ q: "design", type: "freelance", workMode: "remote", city: "Pune", page: 3 });
  });

  it("ignores unknown or empty values", () => {
    expect(
      parseBrowseParams({ q: "", type: "job", workMode: "office", city: "  ", page: "0" }),
    ).toMatchObject({ q: "", type: null, workMode: null, city: null, page: 1 });
    expect(parseBrowseParams({ page: "nope" }).page).toBe(1);
    expect(parseBrowseParams({ page: "9999" }).page).toBe(500);
  });

  it("reads the first value when a param is repeated", () => {
    expect(parseBrowseParams({ type: ["internship", "freelance"] }).type).toBe("internship");
  });
});

describe("browseHref", () => {
  it("drops empty values and page 1", () => {
    expect(browseHref({})).toBe("/opportunities");
    expect(browseHref({ q: "", page: 1 })).toBe("/opportunities");
  });

  it("keeps the active filters", () => {
    expect(browseHref({ q: "design", type: "freelance", city: "Pune", page: 2 })).toBe(
      "/opportunities?q=design&type=freelance&city=Pune&page=2",
    );
  });
});
