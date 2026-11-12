import { z } from "zod";
import {
  MAX_NOT_SELECTED_REASON_LENGTH,
  MAX_OFFER_MESSAGE_LENGTH,
  MAX_OFFER_STIPEND_INR,
} from "./v2/types";

/** Pure validation for offers and "Not selected" (plan 2026-11-12-hiring-and-ai-interview-v2). Client-safe. */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: string) =>
  DATE_PATTERN.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** Today in India time as `YYYY-MM-DD`. */
export const indiaToday = (now = new Date()) =>
  new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : value;

export function offerSchema(now = new Date()) {
  return z.object({
    message: z
      .string()
      .trim()
      .min(1, "Write a short message for the student.")
      .max(
        MAX_OFFER_MESSAGE_LENGTH,
        `Keep the message under ${MAX_OFFER_MESSAGE_LENGTH} characters.`,
      ),
    stipendInr: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number()
        .int("Stipend must be a whole number of rupees.")
        .min(0, "Stipend can't be negative.")
        .max(MAX_OFFER_STIPEND_INR, "That stipend looks too large.")
        .optional(),
    ),
    startDate: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .refine(isRealDate, "Choose a valid start date.")
        .refine((value) => value >= indiaToday(now), "The start date can't be in the past.")
        .optional(),
    ),
  });
}

export type OfferInput = z.output<ReturnType<typeof offerSchema>>;

export const notSelectedReasonSchema = z
  .string()
  .trim()
  .max(
    MAX_NOT_SELECTED_REASON_LENGTH,
    `Keep the reason under ${MAX_NOT_SELECTED_REASON_LENGTH} characters.`,
  )
  .optional()
  .transform((value) => (value ? value : null));

/** Note on the `passed` stage event written when the student accepts an offer. */
export const OFFER_ACCEPTED_NOTE = "Offer accepted";

export const offerAnswerSchema = z.enum(["accept", "decline"]);

/** "₹12,000 / month" or null. */
export const formatStipend = (stipendInr: number | null) =>
  stipendInr === null ? null : `₹${stipendInr.toLocaleString("en-IN")} / month`;

/** "5 Dec 2026" for a `@db.Date` value (stored as UTC midnight). */
export const formatStartDate = (date: Date | null) =>
  date === null
    ? null
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
