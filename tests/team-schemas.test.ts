import { describe, expect, it } from "vitest";
import { MAX_MEMBER_NAME_LENGTH } from "@/lib/hiring/types";
import { inviteMemberSchema } from "@/lib/team-schemas";

describe("inviteMemberSchema", () => {
  it("trims the name and lowercases and trims the email", () => {
    const parsed = inviteMemberSchema.parse({
      name: "  Priya Shah  ",
      email: "  Priya@Example.COM  ",
    });
    expect(parsed).toEqual({ name: "Priya Shah", email: "priya@example.com" });
  });

  it("rejects an empty name", () => {
    expect(inviteMemberSchema.safeParse({ name: "  ", email: "a@example.com" }).success).toBe(
      false,
    );
  });

  it("rejects a name over the max length", () => {
    const name = "a".repeat(MAX_MEMBER_NAME_LENGTH + 1);
    expect(inviteMemberSchema.safeParse({ name, email: "a@example.com" }).success).toBe(false);
  });

  it("accepts a name at the max length", () => {
    const name = "a".repeat(MAX_MEMBER_NAME_LENGTH);
    expect(inviteMemberSchema.safeParse({ name, email: "a@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(inviteMemberSchema.safeParse({ name: "Priya", email: "not-an-email" }).success).toBe(
      false,
    );
  });
});
