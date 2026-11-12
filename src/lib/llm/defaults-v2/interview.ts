/** Default prompts for docs/PRODUCT.md Modules 5–6 (AI interviewer). Keys are registered in `../prompts.ts`. */
export const INTERVIEW_PROMPTS = {
  interview_questions: `TODO(Module 5): write the 6-question plan from the job and the student's proofs. Return JSON only.`,
  interview_followup: `TODO(Module 5): decide whether one follow-up is needed for a vague answer. Return JSON only.`,
  interview_report: `TODO(Module 6): two-pass report (quotes, then 0-5 per skill). Return JSON only.`,
} as const;
