/** Default prompts for docs/PRODUCT.md Modules 1–2 (Challenges). Keys are registered in `../prompts.ts`. */
export const CHALLENGES_PROMPTS = {
  challenge_assist: `TODO(Module 1): rewrite the problem clearly and draft 3 judging points. Return JSON only.`,
  challenge_scoring: `TODO(Module 2): score a submission 0-10 against the judging points with a quote. Return JSON only.`,
} as const;
