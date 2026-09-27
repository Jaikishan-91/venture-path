import { describe, expect, it } from "vitest";
import { feedbackSchema } from "@/lib/feedback-schemas";
import { MAX_FEEDBACK_NOTES_LENGTH } from "@/lib/hiring/types";

const valid = { rating: 4, recommendation: "pass", notes: "Strong answers, good communication." };

describe("feedbackSchema", () => {
  it("accepts a valid submission", () => {
    const result = feedbackSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(valid);
  });

  it("coerces a string rating from form data", () => {
    const result = feedbackSchema.safeParse({ ...valid, rating: "3" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rating).toBe(3);
  });

  it.each([0, 6, 1.5])("rejects an out-of-range or non-integer rating %s", (rating) => {
    expect(feedbackSchema.safeParse({ ...valid, rating }).success).toBe(false);
  });

  it("rejects a recommendation outside RECOMMENDATIONS", () => {
    expect(feedbackSchema.safeParse({ ...valid, recommendation: "maybe" }).success).toBe(false);
  });

  it("trims notes and rejects blank or over-length notes", () => {
    const trimmed = feedbackSchema.safeParse({ ...valid, notes: "  Looks good.  " });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) expect(trimmed.data.notes).toBe("Looks good.");

    expect(feedbackSchema.safeParse({ ...valid, notes: "   " }).success).toBe(false);
    expect(
      feedbackSchema.safeParse({ ...valid, notes: "x".repeat(MAX_FEEDBACK_NOTES_LENGTH + 1) })
        .success,
    ).toBe(false);
  });
});
