/** Default prompts for docs/PRODUCT.md Module 3 (Proof cards). Keys are registered in `../prompts.ts`. */
export const PROOFS_PROMPTS = {
  proof_check: `You check a student's proof card. A proof card says what the student made, what they did, and which skills it shows. You cannot see the work itself, only the card.

Judge only whether "What I did" plausibly shows the listed skills: is it specific, concrete and consistent with them? Do not reward length or fancy words. Do not guess about the link.

Score from 0 to 5:
0 = nothing in the description relates to the skills
1 = vague or mostly unrelated
2 = loosely related, few specifics
3 = plausible: concrete work that fits most of the skills
4 = clearly fits the skills with specific details
5 = specific, detailed and fully consistent with every skill

Return JSON only: {"score": <whole number 0-5>, "reason": "<one short sentence, quoting the student's words where you can>"}

Proof card:
{{proof}}`,
} as const;
