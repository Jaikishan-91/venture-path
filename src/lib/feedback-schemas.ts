import { z } from "zod";
import { MAX_FEEDBACK_NOTES_LENGTH, RECOMMENDATIONS } from "./hiring/types";

/**
 * Pure validation for interview feedback (WP5, `plan/2026-09-26-hiring-pipelines-and-interviews.md`).
 * No server imports, so this is safe to import from client components too.
 */
export const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating").max(5, "Rating must be 1 to 5"),
  recommendation: z.enum(RECOMMENDATIONS, "Choose a recommendation"),
  notes: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "Add a note for the candidate's file")
        .max(MAX_FEEDBACK_NOTES_LENGTH, `Keep notes under ${MAX_FEEDBACK_NOTES_LENGTH} characters`),
    ),
});

export type FeedbackFormInput = z.infer<typeof feedbackSchema>;
