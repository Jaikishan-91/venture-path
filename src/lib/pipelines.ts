import "server-only";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { checkSoftLock, parsePipelineStages } from "./pipeline-schemas";
import type { PipelineFailure, PipelineStageView, Result, StageInput } from "./hiring/types";

type StageRow = {
  id: string;
  position: number;
  name: string;
  kind: PipelineStageView["kind"];
  instructions: string | null;
  externalUrl: string | null;
  durationMinutes: number | null;
  source: PipelineStageView["source"];
  updatedAt: Date;
};

type StageRowWithCounts = StageRow & {
  _count: { applications: number; stageEvents: number; scheduledEvents: number };
};

const stageCounts = {
  _count: { select: { applications: true, stageEvents: true, scheduledEvents: true } },
} as const;

function toView(row: StageRowWithCounts): PipelineStageView {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    kind: row.kind,
    instructions: row.instructions,
    externalUrl: row.externalUrl,
    durationMinutes: row.durationMinutes,
    source: row.source,
    candidateCount: row._count.applications,
    reached:
      row._count.applications > 0 || row._count.stageEvents > 0 || row._count.scheduledEvents > 0,
  };
}

/** A string that changes whenever the stage set, order or content changes (used for stale detection). */
function computeVersion(rows: Pick<StageRow, "id" | "position" | "updatedAt">[]): string {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  return `${ordered.length}:${ordered.map((row) => `${row.position}:${row.id}@${row.updatedAt.getTime()}`).join(",")}`;
}

/** Scopes an opportunity lookup to listings owned by the organisation user `orgUserId`. */
function ownedOpportunity(orgUserId: string, opportunityId: string) {
  return getDb().opportunity.findFirst({
    where: { id: opportunityId, organisationProfile: { userId: orgUserId } },
    select: { id: true, organisationProfile: { select: { status: true } } },
  });
}

/** A listing's pipeline stages, ordered by position, for the organisation that owns it. */
export async function getPipeline(
  orgUserId: string,
  opportunityId: string,
): Promise<{ stages: PipelineStageView[]; version: string } | null> {
  const owned = await ownedOpportunity(orgUserId, opportunityId);
  if (!owned) return null;
  const rows = await getDb().pipelineStage.findMany({
    where: { opportunityId },
    orderBy: { position: "asc" },
    include: stageCounts,
  });
  return { stages: rows.map(toView), version: computeVersion(rows) };
}

/**
 * Save a listing's pipeline (ADR-037): re-reads and compares `expectedVersion` (→ `stale`),
 * validates the shape (→ `invalid`), enforces the soft-lock (→ `locked_stage`), then writes.
 * Because of the unique `[opportunityId, position]` index, kept rows are first parked at
 * temporary negative positions, then every stage is written at its final position `0..n-1`,
 * then removed (unreached) rows are deleted. A stage keeps `source: "ai"` only while its
 * name/kind/instructions are unchanged from the stored row (mirrors the question rule, ADR-032);
 * a brand-new stage (no `id`) keeps whatever source the caller declared, matching how a freshly
 * drafted AI question is trusted until its first edit.
 */
export async function savePipeline(
  orgUserId: string,
  opportunityId: string,
  stages: StageInput[],
  expectedVersion: string,
): Promise<Result<{ version: string }, PipelineFailure>> {
  const owned = await ownedOpportunity(orgUserId, opportunityId);
  if (!owned) return { ok: false, reason: "not_found" };
  if (owned.organisationProfile.status !== "approved") return { ok: false, reason: "not_approved" };

  return getDb().$transaction(async (tx) => {
    const rows = await tx.pipelineStage.findMany({
      where: { opportunityId },
      orderBy: { position: "asc" },
      include: stageCounts,
    });
    if (computeVersion(rows) !== expectedVersion) {
      return { ok: false, reason: "stale" };
    }

    const parsed = parsePipelineStages(stages);
    if (!parsed.ok) return { ok: false, reason: "invalid", message: parsed.message };

    const currentViews = rows.map(toView);
    const lock = checkSoftLock(currentViews, parsed.stages);
    if (!lock.ok) return lock;

    const currentById = new Map(rows.map((row) => [row.id, row]));
    const finalStages = parsed.stages.map((stage) => {
      const existing = stage.id ? currentById.get(stage.id) : undefined;
      const keepsAi =
        !!existing &&
        existing.source === "ai" &&
        existing.name === stage.name &&
        existing.kind === stage.kind &&
        existing.instructions === stage.instructions;
      const source = keepsAi
        ? ("ai" as const)
        : existing
          ? ("organisation" as const)
          : stage.source;
      return { ...stage, source };
    });

    const keepIds = new Set(
      finalStages.map((stage) => stage.id).filter((id): id is string => !!id),
    );
    const removedIds = rows.filter((row) => !keepIds.has(row.id)).map((row) => row.id);

    // Free up positions 0..n-1 before reassigning them (unique [opportunityId, position] index).
    const kept = rows.filter((row) => keepIds.has(row.id));
    await Promise.all(
      kept.map((row, index) =>
        tx.pipelineStage.update({ where: { id: row.id }, data: { position: -(index + 1) } }),
      ),
    );
    if (removedIds.length > 0) {
      await tx.pipelineStage.deleteMany({ where: { id: { in: removedIds } } });
    }
    for (const [position, stage] of finalStages.entries()) {
      const data = {
        position,
        name: stage.name,
        kind: stage.kind,
        instructions: stage.instructions,
        externalUrl: stage.externalUrl,
        durationMinutes: stage.durationMinutes,
        source: stage.source,
      };
      if (stage.id) {
        await tx.pipelineStage.update({ where: { id: stage.id }, data });
      } else {
        await tx.pipelineStage.create({ data: { ...data, opportunityId } });
      }
    }

    const finalRows = await tx.pipelineStage.findMany({
      where: { opportunityId },
      select: { id: true, position: true, updatedAt: true },
    });
    getLogger().info(
      { orgUserId, opportunityId, stageCount: finalStages.length },
      "pipeline saved",
    );
    return { ok: true, version: computeVersion(finalRows) };
  });
}

/** Own listings (other than `excludeOpportunityId`) that have at least one stage, for "Copy from listing". */
export async function listPipelineSources(
  orgUserId: string,
  excludeOpportunityId: string,
): Promise<{ id: string; title: string; stageCount: number }[]> {
  const opportunities = await getDb().opportunity.findMany({
    where: {
      organisationProfile: { userId: orgUserId },
      id: { not: excludeOpportunityId },
      stages: { some: {} },
    },
    select: { id: true, title: true, _count: { select: { stages: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return opportunities.map((opportunity) => ({
    id: opportunity.id,
    title: opportunity.title,
    stageCount: opportunity._count.stages,
  }));
}

/** Another own listing's stages as a template (no ids, source "organisation") for "Copy from listing". */
export async function getPipelineTemplate(
  orgUserId: string,
  fromOpportunityId: string,
): Promise<StageInput[]> {
  const owned = await ownedOpportunity(orgUserId, fromOpportunityId);
  if (!owned) return [];
  const rows = await getDb().pipelineStage.findMany({
    where: { opportunityId: fromOpportunityId },
    orderBy: { position: "asc" },
    select: {
      name: true,
      kind: true,
      instructions: true,
      externalUrl: true,
      durationMinutes: true,
    },
  });
  return rows.map((row) => ({ ...row, source: "organisation" as const }));
}

/**
 * A listing's stages in order, for the progression/scheduling code (WP4). Callers must check
 * ownership themselves; this does not scope by organisation.
 */
export function getOrderedStages(opportunityId: string) {
  return getDb().pipelineStage.findMany({
    where: { opportunityId },
    orderBy: { position: "asc" },
    select: { id: true, position: true, name: true, kind: true, durationMinutes: true },
  });
}
