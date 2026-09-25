import { z } from "zod";

export const MAX_REJECTION_REASON = 500;

const target = {
  profileId: z.string().min(1),
  /** The profile's `updatedAt` as shown to the admin; guards against reviewing unseen edits. */
  profileUpdatedAt: z.iso.datetime(),
};

export const reviewInputSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), ...target }),
  z.object({
    decision: z.literal("reject"),
    ...target,
    reason: z
      .string("Give a reason for rejecting")
      .trim()
      .min(1, "Give a reason for rejecting")
      .max(MAX_REJECTION_REASON, `Keep the reason under ${MAX_REJECTION_REASON} characters`),
  }),
]);
export type ReviewInput = z.output<typeof reviewInputSchema>;
