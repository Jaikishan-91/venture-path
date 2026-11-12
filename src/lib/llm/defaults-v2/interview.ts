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

  interview_evidence: `You read the transcript of a student's written or spoken interview for the role "{{title}}". For each skill below, copy the sentences from the STUDENT'S answers that show (or fail to show) that skill. Copy them word for word from the student's answers; never rephrase, never quote the interviewer, never invent. Use at most 3 short quotes per skill (each under 300 characters). If the student said nothing relevant to a skill, give it an empty list.

Skills: {{skills}}

{{transcript}}

Return JSON only: {"evidence": [{"skill": "...", "quotes": ["..."]}]}`,

  interview_report: `You write an advisory interview report for a small business owner hiring for the role "{{title}}". Use ONLY the quotes below, which are the student's own words, grouped by skill. Do not assume anything that is not in the quotes.

For each skill give a whole-number score from 0 to 5:
0 = no evidence, 1 = very weak, 2 = weak, 3 = adequate, 4 = good, 5 = excellent with concrete detail.
For each skill also pick the single quote that best supports the score (copied exactly from the quotes given, or "" if there are none).
Then list up to 3 strengths, up to 3 concerns the owner should check in a live interview, and a summary of 2 sentences or fewer. Plain words, no jargon. Judge only what was said, not grammar or accent.

{{evidence}}

Return JSON only: {"skills": [{"skill": "...", "score": 0, "quote": "..."}], "strengths": ["..."], "concerns": ["..."], "summary": "..."}`,
} as const;
