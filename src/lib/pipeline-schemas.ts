import { z } from "zod";
import {
  MAX_DURATION_MINUTES,
  MAX_STAGE_INSTRUCTIONS_LENGTH,
  MAX_STAGE_NAME_LENGTH,
  MAX_STAGES,
  MIN_DURATION_MINUTES,
  STAGE_KINDS,
  type PipelineStageView,
  type StageInput,
} from "./hiring/types";

const stageName = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "Enter a name for each stage")
      .max(MAX_STAGE_NAME_LENGTH, `Keep each stage name under ${MAX_STAGE_NAME_LENGTH} characters`),
  );

const stageInstructions = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null)
  .pipe(
    z
      .string()
      .max(
        MAX_STAGE_INSTRUCTIONS_LENGTH,
        `Keep stage instructions under ${MAX_STAGE_INSTRUCTIONS_LENGTH} characters`,
      )
      .nullable(),
  );

/** Http/https only, mirroring the `webUrl` rule in `profile-schemas.ts`. */
const stageExternalUrl = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null)
  .pipe(
    z
      .url({
        protocol: /^https?$/,
        hostname: z.regexes.domain,
        error: "Links must be a full web address starting with https://",
      })
      .max(300, "Keep the link under 300 characters")
      .nullable(),
  );

const stageDurationMinutes = z
  .number()
  .int()
  .min(MIN_DURATION_MINUTES, `Duration must be at least ${MIN_DURATION_MINUTES} minutes`)
  .max(MAX_DURATION_MINUTES, `Duration can't exceed ${MAX_DURATION_MINUTES} minutes`)
  .nullable();

const stageSchema = z.object({
  id: z.uuid().optional(),
  name: stageName,
  kind: z.enum(STAGE_KINDS, "Choose a stage kind"),
  instructions: stageInstructions,
  externalUrl: stageExternalUrl,
  durationMinutes: stageDurationMinutes,
  source: z.enum(["ai", "organisation"] as const),
});

/** `StageInput[]`: at most `MAX_STAGES`, unique names (case-insensitive). Pure (ADR-037). */
export const pipelineStagesSchema = z
  .array(stageSchema)
  .max(MAX_STAGES, `Add at most ${MAX_STAGES} stages`)
  .superRefine((stages, ctx) => {
    const seen = new Set<string>();
    stages.forEach((stage, index) => {
      const key = stage.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "name"],
          message: "Stage names must be unique",
        });
      }
      seen.add(key);
    });
  });

export type PipelineStagesInput = z.output<typeof pipelineStagesSchema>;

/** Validate a pipeline edit before it reaches `checkSoftLock`/`savePipeline`. */
export function parsePipelineStages(
  input: unknown,
): { ok: true; stages: StageInput[] } | { ok: false; message: string } {
  const parsed = pipelineStagesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the pipeline" };
  }
  return { ok: true, stages: parsed.data };
}

export type SoftLockFailure = { ok: false; reason: "locked_stage" | "invalid"; message: string };
export type SoftLockResult = { ok: true } | SoftLockFailure;

const fail = (reason: SoftLockFailure["reason"], message: string): SoftLockFailure => ({
  ok: false,
  reason,
  message,
});

/**
 * Enforce the pipeline soft-lock (ADR-037/D6): a stage is "reached" once any candidate is or was
 * at it (current, history, or a scheduled event). Reached stages can't be deleted, reordered
 * relative to each other, or have their kind changed; no new or unreached stage may be placed
 * before the last reached stage (a candidate must not be able to skip a stage). Pure and
 * exhaustively unit-tested; `savePipeline` calls it inside its transaction.
 */
export function checkSoftLock(current: PipelineStageView[], next: StageInput[]): SoftLockResult {
  const currentById = new Map(current.map((stage) => [stage.id, stage]));

  for (const stage of next) {
    if (stage.id && !currentById.has(stage.id)) {
      return fail("invalid", "This pipeline changed. Reload the page and try again.");
    }
  }

  const reachedCurrent = current.filter((stage) => stage.reached);
  const nextIds = new Set(next.map((stage) => stage.id).filter((id): id is string => !!id));

  for (const stage of reachedCurrent) {
    if (!nextIds.has(stage.id)) {
      return fail(
        "locked_stage",
        `"${stage.name}" already has candidates or history and can't be removed.`,
      );
    }
  }

  const reachedIds = new Set(reachedCurrent.map((stage) => stage.id));
  const reachedOrderInNext = next
    .map((stage) => stage.id)
    .filter((id): id is string => !!id && reachedIds.has(id));
  const reachedOrderInCurrent = reachedCurrent.map((stage) => stage.id);
  for (let i = 0; i < reachedOrderInCurrent.length; i++) {
    if (reachedOrderInNext[i] !== reachedOrderInCurrent[i]) {
      return fail(
        "locked_stage",
        "Stages that already have candidates or history can't be reordered.",
      );
    }
  }

  if (reachedIds.size > 0) {
    const lastReachedIndex = next.reduce(
      (last, stage, index) => (stage.id && reachedIds.has(stage.id) ? index : last),
      -1,
    );
    for (let i = 0; i < lastReachedIndex; i++) {
      const stage = next[i];
      if (!(stage.id && reachedIds.has(stage.id))) {
        const lastReachedStage = currentById.get(next[lastReachedIndex].id!);
        return fail(
          "locked_stage",
          `New or existing stages can't be placed before "${lastReachedStage?.name ?? "a stage with candidates"}", which already has candidates or history.`,
        );
      }
    }
  }

  for (const stage of next) {
    if (!stage.id) continue;
    const existing = currentById.get(stage.id);
    if (existing?.reached && existing.kind !== stage.kind) {
      return fail(
        "locked_stage",
        `"${existing.name}" already has candidates or history and its kind can't change.`,
      );
    }
  }

  return { ok: true };
}
