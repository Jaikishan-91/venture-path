/**
 * Default prompts for docs/PRODUCT.md Modules 5–6 (AI interviewer). Keys are registered in `../prompts.ts`.
 * Adapted from FoloUp (MIT, `src/lib/prompts/generate-questions.ts`, `analytics.ts`,
 * `communication-analysis.ts`) and aural-oss (MIT, follow-up budget in `src/lib/ai/prompts/interviewer.ts`).
 * See THIRD_PARTY_NOTICES.md.
 */
export const INTERVIEW_PROMPTS = {
  interview_questions: `You are an interviewer helping a small business screen a student for the role below. Write exactly {{questionCount}} short interview questions the student will answer in writing or out loud, one at a time:
- 2 questions of kind "skill": each tests one of the role's skills with a practical "how would you / how did you" question.
- 2 questions of kind "proof": each asks about one of the student's own proof cards below ("You built X. How did you handle Y?"). If there are no proof cards, ask about a project or task they did that used the role's skills.
- 1 question of kind "situation": a real situation this business could face (e.g. "A customer complains about …, what do you do?").
- 1 question of kind "motivation": why they want this role and how much time they can give it.

Rules: open-ended questions only, no yes/no; 30 words or fewer each; simple English a student on a phone understands; ask one thing per question; never ask about age, religion, caste, family, health or other personal matters. For "skill" and "proof" questions set "skill" to the skill the question probes (short name, prefer the role's skills).

Return JSON only: {"questions": [{"text": "...", "kind": "skill", "skill": "..."}]}

{{listing}}

{{proofs}}`,

  interview_followup: `You are interviewing a student for the role "{{title}}". They just answered the question below. Decide whether ONE short follow-up question is needed.
Ask a follow-up only when the answer is vague, very short, or misses the main point of the question, and the follow-up would get concrete detail (what they did, how, the result). If the answer is reasonable, return null and move on. The follow-up must stay on the same question, be 25 words or fewer, and never ask for personal information.

Question: {{question}}

{{answer}}

Return JSON only: {"followUp": "..."} or {"followUp": null}`,

  interview_evidence: `You read the transcript of a student's written or spoken interview for the role "{{title}}". For each skill below, copy the sentences from the STUDENT'S answers that show (or fail to show) that skill. Copy them word for word from the student's answers, exactly as written (keep Hinglish, spelling mistakes and short forms); never rephrase, never fix grammar, never quote the interviewer, never invent.
- Use at most 4 short quotes per skill, each under 300 characters.
- Prefer sentences with concrete detail (what they did, where, how, numbers, results). If an answer is only a vague claim ("I am good at it", "I will work hard"), copy that claim so the scorer sees what was actually said.
- When several questions test the same skill, take at least one quote from each relevant answer.
- If the student said nothing relevant to a skill, give it an empty list.

Skills: {{skills}}

{{transcript}}

Return JSON only: {"evidence": [{"skill": "...", "quotes": ["..."]}]}`,

  interview_report: `You write an advisory interview report for a small business owner hiring for the role "{{title}}". Use ONLY the quotes inside the evidence below. They are the student's own words, grouped by skill and by question. Do not assume anything that is not in the quotes. Be a strict, fair scorer: a 4 or 5 must be earned by concrete detail in the quotes.

Score every skill and every question with a whole number from 0 to 5 on this scale:
0 = no answer, nothing relevant, or no quotes.
1 = a vague claim with no example ("I am good at marketing", "I am hard-working").
2 = a generic example anyone could give, without names, numbers or details ("I made some posts for a shop").
3 = one specific, real example: what they did and where, with at least one concrete detail.
4 = a specific example with the method (how they did it) and a result (a number, an outcome or feedback).
5 = several specific examples with results, clearly useful for this business.
For a situation question read "example" as "plan": 2 = a textbook answer ("I will talk to the customer and solve it"), 3 = clear concrete steps, 4–5 = concrete steps that fit this business, backed by reasons or past experience.
For motivation and availability: 1 = generic ("I want to learn"), 2 = a general reason, 3 = a concrete reason tied to this role or business plus clear hours, 4–5 = also real interest shown with specifics (what they know about the business, what they already did).

Rules:
- Score only from the quotes. A skill or question with no quotes scores 0.
- A generic or textbook answer cannot score above 2, however well written.
- Do not reward length, confidence, buzzwords or claims such as "I am an expert"; reward concrete, checkable detail.
- Ignore grammar, spelling, accent and English level. Simple English or Hinglish is fine and never lowers a score.
- Each skill: pick the single quote that best supports its score (copied exactly from the quotes given, or "" when there are none).
- Each question (by its id, e.g. "q1"): a one-line reason in plain English, under 20 words, saying what was specific or what was missing.
- Strengths: 2 or 3 short points backed by the quotes (fewer only if the quotes show none). Concerns: 2 or 3 things the owner should check in the live interview. Summary: 2 sentences or fewer. Plain words, no jargon. Never say whether to hire or reject.

{{evidence}}

Return JSON only: {"skills": [{"skill": "...", "score": 0, "quote": "..."}], "questions": [{"questionId": "q1", "score": 0, "reason": "..."}], "strengths": ["..."], "concerns": ["..."], "summary": "..."}`,
} as const;
