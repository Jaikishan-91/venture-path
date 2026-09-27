import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PipelineStageView, StageInput } from "@/lib/hiring/types";
import { checkSoftLock, parsePipelineStages, pipelineStagesSchema } from "@/lib/pipeline-schemas";
import {
  MAX_STAGES,
  MAX_STAGE_NAME_LENGTH,
  MAX_STAGE_INSTRUCTIONS_LENGTH,
} from "@/lib/hiring/types";

function stage(overrides: Partial<StageInput> = {}): StageInput {
  return {
    name: "Technical interview",
    kind: "interview",
    instructions: null,
    externalUrl: null,
    durationMinutes: 45,
    source: "organisation",
    ...overrides,
  };
}

function view(overrides: Partial<PipelineStageView> = {}): PipelineStageView {
  return {
    id: randomUUID(),
    position: 0,
    candidateCount: 0,
    reached: false,
    ...stage(),
    ...overrides,
  };
}

describe("pipelineStagesSchema", () => {
  it("accepts a well-formed stage list", () => {
    const parsed = pipelineStagesSchema.safeParse([
      stage({ name: "Screen" }),
      stage({ name: "Onsite", kind: "test", durationMinutes: 60 }),
    ]);
    expect(parsed.success).toBe(true);
  });

  it("trims names and treats an empty one as invalid", () => {
    expect(pipelineStagesSchema.safeParse([stage({ name: "  Screen  " })]).data?.[0].name).toBe(
      "Screen",
    );
    expect(pipelineStagesSchema.safeParse([stage({ name: "   " })]).success).toBe(false);
  });

  it("refuses a name over the max length", () => {
    expect(
      pipelineStagesSchema.safeParse([stage({ name: "x".repeat(MAX_STAGE_NAME_LENGTH + 1) })])
        .success,
    ).toBe(false);
  });

  it("refuses duplicate names case-insensitively", () => {
    const result = pipelineStagesSchema.safeParse([
      stage({ name: "Screen" }),
      stage({ name: "screen" }),
    ]);
    expect(result.success).toBe(false);
  });

  it("refuses more than MAX_STAGES", () => {
    const stages = Array.from({ length: MAX_STAGES + 1 }, (_, i) => stage({ name: `Stage ${i}` }));
    expect(pipelineStagesSchema.safeParse(stages).success).toBe(false);
  });

  it("empty instructions become null; over-length instructions are refused", () => {
    expect(
      pipelineStagesSchema.safeParse([stage({ instructions: "  " })]).data?.[0].instructions,
    ).toBeNull();
    expect(
      pipelineStagesSchema.safeParse([
        stage({ instructions: "x".repeat(MAX_STAGE_INSTRUCTIONS_LENGTH + 1) }),
      ]).success,
    ).toBe(false);
  });

  it("accepts http/https external links and refuses others", () => {
    expect(
      pipelineStagesSchema.safeParse([stage({ externalUrl: "https://example.com/test" })]).success,
    ).toBe(true);
    expect(
      pipelineStagesSchema.safeParse([stage({ externalUrl: "ftp://example.com" })]).success,
    ).toBe(false);
    expect(pipelineStagesSchema.safeParse([stage({ externalUrl: "not a url" })]).success).toBe(
      false,
    );
    expect(pipelineStagesSchema.safeParse([stage({ externalUrl: "" })]).data?.[0].externalUrl).toBe(
      null,
    );
  });

  it("enforces the duration range and allows null", () => {
    expect(pipelineStagesSchema.safeParse([stage({ durationMinutes: 14 })]).success).toBe(false);
    expect(pipelineStagesSchema.safeParse([stage({ durationMinutes: 481 })]).success).toBe(false);
    expect(pipelineStagesSchema.safeParse([stage({ durationMinutes: 15 })]).success).toBe(true);
    expect(pipelineStagesSchema.safeParse([stage({ durationMinutes: 480 })]).success).toBe(true);
    expect(
      pipelineStagesSchema.safeParse([stage({ kind: "other", durationMinutes: null })]).success,
    ).toBe(true);
  });

  it("refuses an invalid kind or source", () => {
    expect(pipelineStagesSchema.safeParse([{ ...stage(), kind: "onboarding" }]).success).toBe(
      false,
    );
    expect(pipelineStagesSchema.safeParse([{ ...stage(), source: "candidate" }]).success).toBe(
      false,
    );
  });

  it("requires a valid uuid id when present", () => {
    expect(pipelineStagesSchema.safeParse([stage({ id: "not-a-uuid" })]).success).toBe(false);
    expect(pipelineStagesSchema.safeParse([stage({ id: randomUUID() })]).success).toBe(true);
  });
});

describe("parsePipelineStages", () => {
  it("returns stages on success and a message on failure", () => {
    expect(parsePipelineStages([stage()])).toMatchObject({ ok: true });
    const failure = parsePipelineStages([stage({ name: "" })]);
    expect(failure.ok).toBe(false);
    if (!failure.ok) expect(failure.message).toBeTruthy();
  });
});

describe("checkSoftLock", () => {
  it("allows an empty pipeline becoming stages, and stages being freely edited before anyone applies", () => {
    expect(checkSoftLock([], [stage(), stage({ name: "Second" })])).toEqual({ ok: true });
  });

  it("refuses an unknown stage id", () => {
    const current = [view()];
    const next = [stage({ id: randomUUID() })];
    expect(checkSoftLock(current, next)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses deleting a reached stage", () => {
    const reached = view({ name: "Screen", reached: true, candidateCount: 2 });
    const unreached = view({ name: "Onsite" });
    const next = [stage({ id: unreached.id, name: "Onsite" })]; // reached stage dropped
    expect(checkSoftLock([reached, unreached], next)).toMatchObject({
      ok: false,
      reason: "locked_stage",
    });
  });

  it("allows keeping a reached stage and editing its name/instructions", () => {
    const reached = view({ name: "Screen", reached: true, candidateCount: 1 });
    const next = [stage({ id: reached.id, name: "Phone screen", instructions: "Be nice" })];
    expect(checkSoftLock([reached], next)).toEqual({ ok: true });
  });

  it("refuses changing a reached stage's kind", () => {
    const reached = view({ name: "Screen", kind: "interview", reached: true, candidateCount: 1 });
    const next = [stage({ id: reached.id, name: "Screen", kind: "test" })];
    expect(checkSoftLock([reached], next)).toMatchObject({ ok: false, reason: "locked_stage" });
  });

  it("refuses reordering two reached stages relative to each other", () => {
    const first = view({ name: "Screen", position: 0, reached: true, candidateCount: 1 });
    const second = view({ name: "Onsite", position: 1, reached: true, candidateCount: 1 });
    const next = [
      stage({ id: second.id, name: "Onsite" }),
      stage({ id: first.id, name: "Screen" }),
    ];
    expect(checkSoftLock([first, second], next)).toMatchObject({
      ok: false,
      reason: "locked_stage",
    });
  });

  it("refuses inserting a new stage before the last reached stage", () => {
    const reached = view({ name: "Screen", position: 0, reached: true, candidateCount: 1 });
    const next = [stage({ name: "New step" }), stage({ id: reached.id, name: "Screen" })];
    expect(checkSoftLock([reached], next)).toMatchObject({ ok: false, reason: "locked_stage" });
  });

  it("refuses moving an existing unreached stage before the last reached stage", () => {
    const reached = view({ name: "Screen", position: 0, reached: true, candidateCount: 1 });
    const unreached = view({ name: "Onsite", position: 1 });
    const next = [
      stage({ id: unreached.id, name: "Onsite" }),
      stage({ id: reached.id, name: "Screen" }),
    ];
    expect(checkSoftLock([reached, unreached], next)).toMatchObject({
      ok: false,
      reason: "locked_stage",
    });
  });

  it("allows adding, reordering and deleting unreached stages after the last reached stage", () => {
    const reached = view({ name: "Screen", position: 0, reached: true, candidateCount: 1 });
    const unreachedA = view({ name: "A", position: 1 });
    const unreachedB = view({ name: "B", position: 2 });
    const next = [
      stage({ id: reached.id, name: "Screen" }),
      stage({ id: unreachedB.id, name: "B" }),
      stage({ name: "New step" }), // new stage added, unreachedA deleted
    ];
    expect(checkSoftLock([reached, unreachedA, unreachedB], next)).toEqual({ ok: true });
  });
});
