import "server-only";
import { getLogger } from "./logger";
import { asData, parseJsonObject } from "./llm/json";
import { buildPrompt, DATA_SYSTEM_MESSAGE, getPromptContent } from "./llm/prompts";
import type { LlmClient } from "./llm/provider";
import { MAX_ANSWER_LENGTH } from "./opportunity-schemas";
import { parseScore } from "./skills";

export type AnswerForScoring = { questionId: string; question: string; answer: string };

export type AnswerScores = {
  score: number;
  summary: string | null;
  perAnswer: Map<string, { score: number | null; feedback: string | null }>;
};

/**
 * Parse the scoring reply. The overall score must be valid; per-answer entries for unknown
 * question IDs are ignored and invalid per-answer scores become null. Pure, for tests.
 */
export function parseAnswerScores(
  content: string,
  questionIds: readonly string[],
): AnswerScores | null {
  const parsed = parseJsonObject(content);
  const score = parsed ? parseScore(parsed.score) : null;
  if (!parsed || score === null) return null;

  const perAnswer: AnswerScores["perAnswer"] = new Map();
  const items = Array.isArray(parsed.answers) ? parsed.answers : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = typeof entry.questionId === "string" ? entry.questionId : null;
    if (!id || !questionIds.includes(id) || perAnswer.has(id)) continue;
    perAnswer.set(id, {
      score: parseScore(entry.score),
      feedback:
        typeof entry.feedback === "string" ? entry.feedback.trim().slice(0, 500) || null : null,
    });
  }
  return {
    score,
    summary:
      typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 1000) || null : null,
    perAnswer,
  };
}

/** Score screening answers in one LLM call. Returns null on any failure (the caller keeps old scores). */
export async function scoreAnswers(
  client: LlmClient,
  listing: {
    title: string;
    skills: string[];
    requirements: string | null;
    experienceLevel: string | null;
  },
  answers: AnswerForScoring[],
): Promise<AnswerScores | null> {
  const block = answers
    .map(
      (item, index) =>
        `Question ${index + 1} (questionId: ${item.questionId}): ${item.question}\n` +
        asData("answer", item.answer, MAX_ANSWER_LENGTH),
    )
    .join("\n\n");

  const prompt = buildPrompt(await getPromptContent("answer_scoring"), {
    title: listing.title,
    skills: listing.skills.join(", "),
    requirements: listing.requirements ?? "",
    experienceLevel: listing.experienceLevel ?? "",
    answers: block,
  });
  const content = await client.chat([
    { role: "system", content: DATA_SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ]);
  if (!content) return null;

  const result = parseAnswerScores(
    content,
    answers.map((item) => item.questionId),
  );
  if (!result) {
    getLogger().warn({ contentSample: content.slice(0, 200) }, "Failed to parse answer scores");
  }
  return result;
}
