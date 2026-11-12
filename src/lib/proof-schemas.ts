import { z } from "zod";
import { normalizeSkills } from "./skills";
import {
  MAX_APPLICATION_PROOFS,
  MAX_APPLY_TASK_ANSWER_LENGTH,
  MAX_APPLY_TASK_LENGTH,
  MAX_PROOF_SKILLS,
  MAX_PROOF_TITLE_LENGTH,
  MAX_PROOF_WHAT_I_DID_LENGTH,
  PROOF_LEVEL_RANK,
  type ProofLevel,
} from "./v2/types";

/** Pure validation and helpers for proof cards (docs/PRODUCT.md Modules 3–4). Client-safe. */

export const MAX_PROOF_LINK_LENGTH = 500;

const linkSchema = z
  .string()
  .trim()
  .max(MAX_PROOF_LINK_LENGTH, `Keep the link under ${MAX_PROOF_LINK_LENGTH} characters`)
  .transform((value) => value || null)
  .pipe(
    z
      .url({
        protocol: /^https?$/,
        hostname: z.regexes.domain,
        error: "The link must be a full web address starting with https://",
      })
      .nullable(),
  );

/**
 * The "Add proof" form. `level` and the AI fields are never part of it: only app code sets them.
 * Skills come as one comma-separated string and are normalised (`skills.ts`).
 */
export const proofSchema = z.object({
  title: z
    .string("Enter what you made")
    .trim()
    .min(1, "Enter what you made")
    .max(MAX_PROOF_TITLE_LENGTH, `Keep the title under ${MAX_PROOF_TITLE_LENGTH} characters`),
  link: z.string().default("").pipe(linkSchema),
  whatIDid: z
    .string("Describe what you did")
    .trim()
    .min(1, "Describe what you did")
    .max(
      MAX_PROOF_WHAT_I_DID_LENGTH,
      `Keep "What I did" under ${MAX_PROOF_WHAT_I_DID_LENGTH} characters`,
    ),
  skills: z
    .string()
    .max(2000)
    .default("")
    .transform((value) => value.split(",").filter((part) => part.trim()))
    .refine(
      (parts) => normalizeSkills(parts, Number.POSITIVE_INFINITY).length <= MAX_PROOF_SKILLS,
      `Add at most ${MAX_PROOF_SKILLS} skills`,
    )
    .transform((parts) => normalizeSkills(parts, MAX_PROOF_SKILLS))
    .refine((skills) => skills.length > 0, "Add at least one skill"),
});
export type ProofInput = z.output<typeof proofSchema>;

/** Optional apply task on a listing (Module 4). Empty → null. */
export const applyTaskSchema = z
  .string()
  .trim()
  .max(MAX_APPLY_TASK_LENGTH, `Keep the apply task under ${MAX_APPLY_TASK_LENGTH} characters`)
  .transform((value) => value || null);

/** The applicant's answer to a listing's apply task, or an error message. */
export function parseTaskAnswer(
  value: unknown,
): { ok: true; answer: string } | { ok: false; message: string } {
  const answer = typeof value === "string" ? value.trim() : "";
  if (!answer) return { ok: false, message: "Answer the task" };
  if (answer.length > MAX_APPLY_TASK_ANSWER_LENGTH) {
    return {
      ok: false,
      message: `Keep the task answer under ${MAX_APPLY_TASK_ANSWER_LENGTH} characters`,
    };
  }
  return { ok: true, answer };
}

/** Proof card IDs picked on the apply form: strings, de-duplicated, at most the limit. */
export function parseProofIds(
  values: readonly unknown[],
): { ok: true; ids: string[] } | { ok: false; message: string } {
  const ids = [
    ...new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0)),
  ];
  if (ids.length > MAX_APPLICATION_PROOFS) {
    return { ok: false, message: `Attach at most ${MAX_APPLICATION_PROOFS} proof cards` };
  }
  if (ids.some((id) => id.length > 64)) return { ok: false, message: "Choose your proof cards" };
  return { ok: true, ids };
}

/** Strongest badge first, then newest. Does not mutate. */
export function sortByProofLevel<T extends { level: ProofLevel; createdAt?: Date }>(
  proofs: readonly T[],
): T[] {
  return [...proofs].sort(
    (a, b) =>
      PROOF_LEVEL_RANK[a.level] - PROOF_LEVEL_RANK[b.level] ||
      (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
}

/** Minimum AI score (0–5) for 🔵 Checked. */
export const PROOF_CHECK_PASS_SCORE = 3;

/**
 * Level a manual proof earns from its check (Module 3): 🔵 when the evidence opens (a reachable
 * link, or no link but a file) and the AI judged the description plausible. Never `verified`.
 */
export function levelAfterCheck(input: {
  hasLink: boolean;
  linkReachable: boolean;
  hasFile: boolean;
  score: number | null;
}): Extract<ProofLevel, "added" | "checked"> {
  const evidenceOpens = input.hasLink ? input.linkReachable : input.hasFile;
  return evidenceOpens && input.score !== null && input.score >= PROOF_CHECK_PASS_SCORE
    ? "checked"
    : "added";
}

/** Proof card text used as candidate evidence (AI screening without a resume). */
export function proofEvidenceText(
  proofs: readonly { title: string; whatIDid: string; skills: string[] }[],
): string {
  return proofs
    .map(
      (proof, index) =>
        `Proof ${index + 1}: ${proof.title}\nWhat I did: ${proof.whatIDid}\nSkills: ${proof.skills.join(", ")}`,
    )
    .join("\n\n");
}
