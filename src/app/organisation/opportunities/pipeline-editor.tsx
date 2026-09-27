"use client";

import { Plus, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import {
  DEFAULT_DURATION_MINUTES,
  MAX_STAGES,
  type PipelineStageView,
  type StageInput,
} from "@/lib/hiring/types";
import {
  copyPipelineTemplateAction,
  savePipelineAction,
  suggestPipelineAction,
} from "./pipeline-actions";
import { PipelineStageCard } from "./pipeline-stage-card";

export type PipelineSource = { id: string; title: string; stageCount: number };

/** A pipeline stage in the editor's local (possibly unsaved) state. */
export type EditorStage = StageInput & {
  /** Stable React key. Equals `id` for a saved stage; a client-generated key for a new one. */
  localKey: string;
  reached: boolean;
  candidateCount: number;
};

function newLocalKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `stage-${Math.random().toString(36).slice(2)}`;
}

function fromView(stage: PipelineStageView): EditorStage {
  return {
    id: stage.id,
    name: stage.name,
    kind: stage.kind,
    instructions: stage.instructions,
    externalUrl: stage.externalUrl,
    durationMinutes: stage.durationMinutes,
    source: stage.source,
    localKey: stage.id,
    reached: stage.reached,
    candidateCount: stage.candidateCount,
  };
}

function fromInput(stage: StageInput): EditorStage {
  return { ...stage, localKey: newLocalKey(), reached: false, candidateCount: 0 };
}

function toInput(stage: EditorStage): StageInput {
  return {
    id: stage.id,
    name: stage.name,
    kind: stage.kind,
    instructions: stage.instructions,
    externalUrl: stage.externalUrl,
    durationMinutes: stage.durationMinutes,
    source: stage.source,
  };
}

type ActionState = { status: "idle" } | { status: "error"; message: string };

/**
 * The listing's hiring pipeline (ADR-037/D6): an ordered list of stage cards, editable up to
 * MAX_STAGES, with AI suggestions and copy-from-listing. Reached stages (candidates or history)
 * can't be removed or change kind, and no stage may be inserted before the last reached one; the
 * server enforces the same rule (`checkSoftLock`) and is the source of truth.
 */
export function PipelineEditor({
  opportunityId,
  initialStages,
  initialVersion,
  aiEnabled,
  sources,
}: {
  opportunityId: string;
  initialStages: PipelineStageView[];
  initialVersion: string;
  aiEnabled: boolean;
  sources: PipelineSource[];
}) {
  const [stages, setStages] = useState<EditorStage[]>(() => initialStages.map(fromView));
  const [version, setVersion] = useState(initialVersion);
  const [dirty, setDirty] = useState(false);
  const [errorState, setErrorState] = useState<ActionState>({ status: "idle" });
  useActionErrorToast(errorState);

  const [savePending, startSave] = useTransition();
  const [suggestPending, startSuggest] = useTransition();
  const [copyPending, startCopy] = useTransition();
  const pending = savePending || suggestPending || copyPending;

  /** Replaces every unreached stage with `newStages`, keeping reached stages as they are. */
  function applyReplacement(newStages: StageInput[]) {
    setStages((current) => {
      const reachedStages = current.filter((stage) => stage.reached);
      const room = Math.max(0, MAX_STAGES - reachedStages.length);
      return [...reachedStages, ...newStages.slice(0, room).map(fromInput)];
    });
    setDirty(true);
  }

  function addStage() {
    setStages((current) => [
      ...current,
      fromInput({
        name: "",
        kind: "interview",
        instructions: null,
        externalUrl: null,
        durationMinutes: DEFAULT_DURATION_MINUTES,
        source: "organisation",
      }),
    ]);
    setDirty(true);
  }

  function updateStage(localKey: string, patch: Partial<EditorStage>) {
    setStages((current) =>
      current.map((stage) => (stage.localKey === localKey ? { ...stage, ...patch } : stage)),
    );
    setDirty(true);
  }

  function removeStage(localKey: string) {
    setStages((current) => current.filter((stage) => stage.localKey !== localKey));
    setDirty(true);
  }

  function moveStage(index: number, direction: -1 | 1) {
    setStages((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  function handleSave() {
    const payload = stages.map(toInput);
    startSave(async () => {
      const result = await savePipelineAction(opportunityId, payload, version);
      if (result.status === "error") {
        setErrorState({ status: "error", message: result.message });
        return;
      }
      setStages(result.stages.map(fromView));
      setVersion(result.version);
      setDirty(false);
      setErrorState({ status: "idle" });
      toast.success("Pipeline saved.");
    });
  }

  function handleSuggest() {
    startSuggest(async () => {
      const result = await suggestPipelineAction(opportunityId);
      if (result.status === "error") {
        setErrorState({ status: "error", message: result.message });
        return;
      }
      applyReplacement(result.stages);
      toast.success("AI suggested a pipeline. Review it, then save.");
    });
  }

  function handleCopy(fromOpportunityId: string) {
    startCopy(async () => {
      const result = await copyPipelineTemplateAction(fromOpportunityId);
      if (result.status === "error") {
        setErrorState({ status: "error", message: result.message });
        return;
      }
      applyReplacement(result.stages);
      toast.success("Pipeline copied. Review it, then save.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hiring pipeline</CardTitle>
        <CardDescription>
          Candidates move through these steps after applying. Leave it empty to accept or reject
          directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {aiEnabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleSuggest}
            >
              <Sparkles strokeWidth={1.75} aria-hidden />
              {suggestPending ? "Asking AI…" : "Suggest with AI"}
            </Button>
          )}
          {sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="pipeline-copy-source" className="text-sm whitespace-nowrap">
                Copy from listing
              </Label>
              <select
                id="pipeline-copy-source"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm disabled:opacity-50 dark:bg-input/30"
                disabled={pending}
                defaultValue=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (value) handleCopy(value);
                  event.target.value = "";
                }}
              >
                <option value="" disabled>
                  Choose a listing…
                </option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.title} ({source.stageCount} stage{source.stageCount === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pipeline yet. Applicants are accepted or rejected directly.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {stages.map((stage, index) => (
              <PipelineStageCard
                key={stage.localKey}
                stage={stage}
                index={index}
                canMoveUp={index > 0 && !stage.reached && !stages[index - 1].reached}
                canMoveDown={
                  index < stages.length - 1 && !stage.reached && !stages[index + 1].reached
                }
                disabled={pending}
                onChange={(patch) => updateStage(stage.localKey, patch)}
                onRemove={() => removeStage(stage.localKey)}
                onMoveUp={() => moveStage(index, -1)}
                onMoveDown={() => moveStage(index, 1)}
              />
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || stages.length >= MAX_STAGES}
            onClick={addStage}
          >
            <Plus strokeWidth={1.75} />
            Add stage
          </Button>
          <Button type="button" size="sm" disabled={pending || !dirty} onClick={handleSave}>
            {savePending ? "Saving…" : "Save pipeline"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
