import "server-only";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { asData, parseJsonObject } from "./llm/json";
import { buildPrompt, DATA_SYSTEM_MESSAGE, getPromptContent } from "./llm/prompts";
import { createLlmClient } from "./llm/provider";
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MAX_STAGE_INSTRUCTIONS_LENGTH,
  MAX_STAGE_NAME_LENGTH,
  MAX_STAGES,
  MIN_DURATION_MINUTES,
  STAGE_KINDS,
  type Result,
  type StageInput,
  type StageKind,
} from "./hiring/types";

const MAX_LISTING_CHARS = 8000;

function parseKind(value: unknown): StageKind | null {
  return typeof value === "string" && (STAGE_KINDS as readonly string[]).includes(value)
    ? (value as StageKind)
    : null;
}

/** Interview/test stages always get a duration (clamped to range, defaulted when missing); others never do. */
function parseDuration(kind: StageKind, value: unknown): number | null {
  const needsDuration = kind === "interview" || kind === "test";
  if (!needsDuration) return null;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return DEFAULT_DURATION_MINUTES;
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(num)));
}

/**
 * Parse the pipeline-suggest reply into stages the editor can apply. Invalid stages are dropped,
 * names are deduplicated (case-insensitive) and the list is clamped to `MAX_STAGES`. Pure, for
 * tests. Returns null when nothing usable came back.
 */
export function parsePipelineSuggestion(content: string): { stages: StageInput[] } | null {
  const parsed = parseJsonObject(content);
  if (!parsed) return null;
  const rawStages = Array.isArray(parsed.stages) ? parsed.stages : [];
  const seen = new Set<string>();
  const stages: StageInput[] = [];

  for (const raw of rawStages) {
    if (stages.length >= MAX_STAGES) break;
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;

    const kind = parseKind(record.kind);
    if (!kind) continue;

    const name = typeof record.name === "string" ? record.name.replace(/\s+/g, " ").trim() : "";
    if (!name || name.length > MAX_STAGE_NAME_LENGTH) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const instructionsRaw =
      typeof record.instructions === "string" ? record.instructions.trim() : "";
    const instructions =
      instructionsRaw.length > 0 ? instructionsRaw.slice(0, MAX_STAGE_INSTRUCTIONS_LENGTH) : null;

    stages.push({
      name,
      kind,
      instructions,
      externalUrl: null,
      durationMinutes: parseDuration(kind, record.durationMinutes),
      source: "ai",
    });
  }

  return stages.length > 0 ? { stages } : null;
}

export type SuggestPipelineFailure = "not_found" | "no_llm" | "parse_error";

/**
 * Ask the LLM to draft a hiring pipeline for a listing (ADR-037/D6). The suggestion is returned
 * to the caller, not saved: the pipeline editor applies it to its local (unsaved) state. Sets
 * `Opportunity.pipelineAssistedAt` on success, mirroring `listing-assist`'s `aiAssistedAt`.
 */
export async function suggestPipeline(
  orgUserId: string,
  opportunityId: string,
): Promise<Result<{ stages: StageInput[] }, SuggestPipelineFailure>> {
  const db = getDb();
  const logger = getLogger();
  const opportunity = await db.opportunity.findFirst({
    where: { id: opportunityId, organisationProfile: { userId: orgUserId } },
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
    `Skills: ${opportunity.skills.join(", ") || "-"}`,
    `Description:\n${opportunity.description}`,
    `Requirements:\n${opportunity.requirements ?? "-"}`,
  ].join("\n");
  const prompt = buildPrompt(await getPromptContent("pipeline_suggest"), {
    maxStages: String(MAX_STAGES),
    listing: asData("listing", listingText, MAX_LISTING_CHARS),
  });
  const content = await client.chat([
    { role: "system", content: DATA_SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ]);
  if (!content) return { ok: false, reason: "no_llm" };

  const suggestion = parsePipelineSuggestion(content);
  if (!suggestion) {
    logger.warn(
      { opportunityId, contentSample: content.slice(0, 200) },
      "Failed to parse pipeline suggestion",
    );
    return { ok: false, reason: "parse_error" };
  }

  await db.opportunity.update({
    where: { id: opportunityId },
    data: { pipelineAssistedAt: new Date() },
  });
  logger.info(
    { opportunityId, stageCount: suggestion.stages.length, model: client.model },
    "pipeline suggestion completed",
  );
  return { ok: true, stages: suggestion.stages };
}
