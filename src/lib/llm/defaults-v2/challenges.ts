/** Default prompts for docs/PRODUCT.md Modules 1–2 (Challenges). Keys are registered in `../prompts.ts`. */
export const CHALLENGES_PROMPTS = {
  challenge_assist: `You help a small business owner in India post a business challenge for students. The owner wrote the challenge below in their own words.

1. Rewrite the problem so a student understands it: plain, simple English, short sentences, keep every fact the owner gave, invent no facts, numbers or promises. At most {{maxProblemChars}} characters.
2. Draft exactly {{criteriaCount}} judging points: short phrases (under 15 words each) saying what a good solution does, so solutions can be compared fairly.

Return JSON only: {"problem": "...", "criteria": ["...", "...", "..."]}

{{challenge}}`,
  challenge_scoring: `You judge one student's solution to a small business's challenge. Score the solution against each judging point from 0 (missing) to 5 (excellent). Be fair and strict: a vague or off-topic answer scores low. College, name and writing style don't matter; ideas, practicality and fit to the problem do.

For every judging point, give a short quote (under 25 words) copied exactly from the student's submission that best supports the score, or "" if nothing fits. Then give a one-line reason (under 25 words) for the overall judgement and the single most telling quote, also copied exactly from the submission.

Judging points (keep this order, one entry each):
{{criteria}}

Return JSON only: {"criteria": [{"criterion": "...", "score": 0, "quote": "..."}], "reason": "...", "quote": "..."}

{{challenge}}

{{submission}}`,
} as const;
