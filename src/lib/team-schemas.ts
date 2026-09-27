import { z } from "zod";
import { MAX_MEMBER_NAME_LENGTH } from "./hiring/types";

/**
 * Pure validation for team invites (WP1, `plan/2026-09-26-hiring-pipelines-and-interviews.md`).
 * No server imports, so this is safe to import from client components too.
 */
export const inviteMemberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(MAX_MEMBER_NAME_LENGTH, `Keep the name under ${MAX_MEMBER_NAME_LENGTH} characters`),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
