import { describe, expect, it } from "vitest";
import { parseFlash } from "@/lib/flash-shared";

const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value));

describe("parseFlash", () => {
  it("reads a valid flash", () => {
    expect(parseFlash(encode({ id: "1", type: "success", message: "Saved." }))).toEqual({
      id: "1",
      type: "success",
      message: "Saved.",
    });
  });

  it("ignores missing, malformed and unknown values", () => {
    expect(parseFlash(undefined)).toBeNull();
    expect(parseFlash("%E0%A4%A")).toBeNull();
    expect(parseFlash("not-json")).toBeNull();
    expect(parseFlash(encode({ id: "1", type: "danger", message: "x" }))).toBeNull();
    expect(parseFlash(encode({ id: "1", type: "info", message: "" }))).toBeNull();
  });

  it("caps the message length", () => {
    const flash = parseFlash(encode({ id: "1", type: "info", message: "a".repeat(900) }));
    expect(flash?.message).toHaveLength(500);
  });
});
