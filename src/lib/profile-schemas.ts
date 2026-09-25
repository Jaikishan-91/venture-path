import { z } from "zod";

export const MSME_STATUSES = ["pending", "approved", "rejected"] as const;
export type MsmeStatus = (typeof MSME_STATUSES)[number];

export const MAX_SKILLS = 20;
export const MAX_LINKS = 5;
export const MIN_GRADUATION_YEAR = 1950;
export const maxGraduationYear = () => new Date().getFullYear() + 8;

export const requiredText = (label: string, max: number) =>
  z
    .string(`Enter ${label}`)
    .trim()
    .min(1, `Enter ${label}`)
    .max(max, `Keep ${label} under ${max} characters`);

export const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} under ${max} characters`)
    .transform((value) => value || null);

const webUrl = (message: string) =>
  z.url({ protocol: /^https?$/, hostname: z.regexes.domain, error: message }).max(200, message);

/** Splits a text input into trimmed, non-empty parts. */
const listFrom = (separator: RegExp) =>
  z
    .string()
    .max(2000)
    .transform((value) =>
      value
        .split(separator)
        .map((part) => part.trim())
        .filter(Boolean),
    );

/** Comma-separated tags, lowercased and de-duplicated. */
export const skillList = (max: number) =>
  listFrom(/,/)
    .transform((skills) => [...new Set(skills.map((skill) => skill.toLowerCase()))])
    .pipe(
      z
        .array(z.string().max(40, "Keep each skill under 40 characters"))
        .max(max, `Add at most ${max} skills`),
    );

export const studentProfileSchema = z.object({
  institution: requiredText("your institution", 120),
  course: requiredText("your course", 120),
  graduationYear: z.coerce
    .number("Enter your graduation year")
    .int("Enter a valid year")
    .refine(
      (year) => year >= MIN_GRADUATION_YEAR && year <= maxGraduationYear(),
      `Enter a year between ${MIN_GRADUATION_YEAR} and ${maxGraduationYear()}`,
    ),
  skills: skillList(MAX_SKILLS),
  bio: optionalText("your bio", 1000),
  links: listFrom(/\r?\n/).pipe(
    z
      .array(webUrl("Links must be full web addresses starting with https://"))
      .max(MAX_LINKS, `Add at most ${MAX_LINKS} links`),
  ),
});
export type StudentProfileInput = z.output<typeof studentProfileSchema>;

export const msmeProfileSchema = z.object({
  businessName: requiredText("your business name", 120),
  description: requiredText("a description", 2000),
  industry: requiredText("your industry", 80),
  location: requiredText("your location", 120),
  website: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(webUrl("Website must be a full web address starting with https://").nullable()),
});
export type MsmeProfileInput = z.output<typeof msmeProfileSchema>;

const MSME_REVIEWED_FIELDS = [
  "businessName",
  "description",
  "industry",
  "location",
  "website",
] as const satisfies readonly (keyof MsmeProfileInput)[];

export function msmeProfileChanged(current: MsmeProfileInput, next: MsmeProfileInput): boolean {
  return MSME_REVIEWED_FIELDS.some((field) => current[field] !== next[field]);
}

/**
 * Status after an MSME saves its profile. Any change to an approved profile, and any save of a
 * rejected one, sends it back for admin review.
 */
export function nextMsmeStatus(current: MsmeStatus | null, changed: boolean): MsmeStatus {
  if (current === "approved" && !changed) return "approved";
  return "pending";
}
