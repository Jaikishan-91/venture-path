import { describe, expect, it } from "vitest";
import { currentHref } from "@/components/app-sidebar";

const items = [
  { href: "/organisation" },
  { href: "/organisation/opportunities" },
  { href: "/organisation/opportunities/new" },
];

describe("currentHref", () => {
  it("matches the dashboard only on its own path", () => {
    expect(currentHref(items, "/organisation")).toBe("/organisation");
  });

  it("picks the most specific matching link", () => {
    expect(currentHref(items, "/organisation/opportunities/new")).toBe(
      "/organisation/opportunities/new",
    );
    expect(currentHref(items, "/organisation/opportunities/abc/edit")).toBe(
      "/organisation/opportunities",
    );
  });

  it("ignores prefixes that are not path segments", () => {
    expect(currentHref([{ href: "/user" }], "/users")).toBeUndefined();
  });
});
