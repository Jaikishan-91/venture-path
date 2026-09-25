import "server-only";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { asData, parseJsonObject, stringList } from "./llm/json";
import { buildPrompt, DATA_SYSTEM_MESSAGE, getPromptContent } from "./llm/prompts";
import { createLlmClient } from "./llm/provider";
import {
  MAX_OPPORTUNITY_SKILLS,
  MAX_QUESTION_LENGTH,
  MIN_QUESTION_LENGTH,
} from "./opportunity-schemas";
import { refreshOpportunityEmbedding } from "./search";
import { mergeSkills, normalizeSkills } from "./skills";

/** How many screening questions the AI drafts for a listing without any. */
export const DRAFT_QUESTION_COUNT = 4;
const MAX_LISTING_CHARS = 8000;

export type ListingSuggestions = { skills: string[]; questions: string[] };

/** Parse the assist reply: normalised skills and usable question strings. Pure, for tests. */
export function parseListingSuggestions(content: string): ListingSuggestions | null {
  const parsed = parseJsonObject(content);
  if (!parsed) return null;
  const skills = normalizeSkills(stringList(parsed.skills, 50), MAX_OPPORTUNITY_SKILLS);
  const seen = new Set<string>();
  const questions = stringList(parsed.questions, 20)
    .map((question) => question.replace(/\s+/g, " ").trim())
    .filter((question) => {
      const key = question.toLowerCase();
      if (question.length < MIN_QUESTION_LENGTH || question.length > MAX_QUESTION_LENGTH)
        return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, DRAFT_QUESTION_COUNT);
  if (skills.length === 0 && questions.length === 0) return null;
  return { skills, questions };
}

export type AssistResult =
  | { ok: true; addedSkills: string[]; addedQuestions: number }
  | { ok: false; reason: "not_found" | "no_llm" | "parse_error" };

/**
 * Ask the LLM for the listing's required skills and draft screening questions (ADR-032).
 * Skills are merged after the organisation's own (never replacing them). Questions are drafted
 * only when `draftQuestions` is set, the listing has no questions and nobody has applied yet.
 * Callers must have checked ownership; see `assistOwnListing`.
 */
export async function assistListing(
  opportunityId: string,
  { draftQuestions }: { draftQuestions: boolean },
): Promise<AssistResult> {
  const db = getDb();
  const logger = getLogger();
  const opportunity = await db.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      title: true,
      type: true,
      description: true,
      requirements: true,
      experienceLevel: true,
      skills: true,
    },
  });
  if (!opportunity) return { ok: false, reason: "not_found" };

  const client = createLlmClient();
  if (!client) return { ok: false, reason: "no_llm" };

  const listingText = [
    `Title: ${opportunity.title}`,
    `Type: ${opportunity.type}`,
    `Experience level: ${opportunity.experienceLevel ?? "-"}`,
    `Skills listed by the organisation: ${opportunity.skills.join(", ") || "-"}`,
    `Description:\n${opportunity.description}`,
    `Requirements:\n${opportunity.requirements ?? "-"}`,
  ].join("\n");
  const prompt = buildPrompt(await getPromptContent("listing_assist"), {
    maxSkills: String(MAX_OPPORTUNITY_SKILLS),
    questionCount: String(DRAFT_QUESTION_COUNT),
    listing: asData("listing", listingText, MAX_LISTING_CHARS),
  });
  const content = await client.chat([
    { role: "system", content: DATA_SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ]);
  if (!content) return { ok: false, reason: "no_llm" };

  const suggestions = parseListingSuggestions(content);
  if (!suggestions) {
    logger.warn(
      { opportunityId, contentSample: content.slice(0, 200) },
      "Failed to parse listing assist",
    );
    return { ok: false, reason: "parse_error" };
  }

  const { addedSkills, addedQuestions } = await db.$transaction(async (tx) => {
    // Re-read inside the transaction so an edit saved meanwhile is merged, not overwritten.
    const current = await tx.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      select: { skills: true, _count: { select: { questions: true, applications: true } } },
    });
    const skills = mergeSkills(current.skills, suggestions.skills, MAX_OPPORTUNITY_SKILLS);
    const addedSkills = skills.slice(current.skills.length);
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: { skills, aiAssistedAt: new Date() },
    });

    const canDraft =
      draftQuestions && current._count.questions === 0 && current._count.applications === 0;
    if (canDraft && suggestions.questions.length > 0) {
      await tx.opportunityQuestion.createMany({
        data: suggestions.questions.map((prompt, position) => ({
          opportunityId,
          position,
          prompt,
          source: "ai" as const,
        })),
      });
    }
    return { addedSkills, addedQuestions: canDraft ? suggestions.questions.length : 0 };
  });

  if (addedSkills.length > 0) {
    try {
      await refreshOpportunityEmbedding(opportunityId);
    } catch (err) {
      logger.error({ opportunityId, err }, "opportunity embedding failed after assist");
    }
  }
  logger.info(
    { opportunityId, addedSkills: addedSkills.length, addedQuestions, model: client.model },
    "listing assist completed",
  );
  return { ok: true, addedSkills, addedQuestions };
}

/** `assistListing` for the organisation that owns the listing (session user ID). */
export async function assistOwnListing(
  organisationUserId: string,
  opportunityId: string,
  options: { draftQuestions: boolean },
): Promise<AssistResult> {
  const owned = await getDb().opportunity.findFirst({
    where: { id: opportunityId, organisationProfile: { userId: organisationUserId } },
    select: { id: true },
  });
  if (!owned) return { ok: false, reason: "not_found" };
  return assistListing(opportunityId, options);
}
