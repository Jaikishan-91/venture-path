"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MAX_STAGE_INSTRUCTIONS_LENGTH,
  MAX_STAGE_NAME_LENGTH,
  MIN_DURATION_MINUTES,
  STAGE_KIND_LABELS,
  STAGE_KINDS,
  type StageKind,
} from "@/lib/hiring/types";
import type { EditorStage } from "./pipeline-editor";

const selectClass =
  "h-10 w-full rounded-[8px] border border-input bg-white px-3 text-base md:text-sm disabled:opacity-50 dark:bg-input/30";

/** Mirrors `reached`: a stage with current candidates says how many; one with only history doesn't. */
function lockLabel(stage: EditorStage): string {
  return stage.candidateCount > 0
    ? `${stage.candidateCount} candidate${stage.candidateCount === 1 ? "" : "s"} · locked`
    : "Locked (has history)";
}

export function PipelineStageCard({
  stage,
  index,
  canMoveUp,
  canMoveDown,
  disabled,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  stage: EditorStage;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
  onChange: (patch: Partial<EditorStage>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const showsDuration = stage.kind === "interview" || stage.kind === "test";
  const nameId = `stage-name-${index}`;
  const kindId = `stage-kind-${index}`;
  const durationId = `stage-duration-${index}`;
  const instructionsId = `stage-instructions-${index}`;
  const linkId = `stage-link-${index}`;

  return (
    <li className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0f0] bg-[#fafafa] px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[12px] font-semibold text-white tabular-nums"
          >
            {index + 1}
          </span>
          <span className="text-sm font-medium text-[#121212]">Step {index + 1}</span>
          <span className="text-[13px] text-[#737373]">· {STAGE_KIND_LABELS[stage.kind]}</span>
          {stage.reached && (
            <span className="inline-flex items-center rounded-md border border-[#fde68a] bg-[#fffbeb] px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-[#92400e]">
              {lockLabel(stage)}
            </span>
          )}
          {stage.source === "ai" && (
            <span className="inline-flex items-center rounded-md bg-[#f0fdf4] px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-[#15803d]">
              AI draft
            </span>
          )}
        </div>
        <div className="flex items-center rounded-lg border border-[#e5e5e5] bg-white p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move step ${index + 1} up`}
            disabled={disabled || !canMoveUp}
            onClick={onMoveUp}
          >
            <ChevronUp strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move step ${index + 1} down`}
            disabled={disabled || !canMoveDown}
            onClick={onMoveDown}
          >
            <ChevronDown strokeWidth={1.75} />
          </Button>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-[#e5e5e5]" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove step ${index + 1}`}
            disabled={disabled || stage.reached}
            onClick={onRemove}
            className="hover:text-[#dc2626]"
          >
            <X strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={stage.name}
              maxLength={MAX_STAGE_NAME_LENGTH}
              disabled={disabled}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={kindId}>Kind</Label>
            <select
              id={kindId}
              className={selectClass}
              value={stage.kind}
              disabled={disabled || stage.reached}
              onChange={(event) => {
                const kind = event.target.value as StageKind;
                const needsDuration = kind === "interview" || kind === "test";
                onChange({
                  kind,
                  durationMinutes: needsDuration
                    ? (stage.durationMinutes ?? DEFAULT_DURATION_MINUTES)
                    : null,
                });
              }}
            >
              {STAGE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {STAGE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showsDuration && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={durationId}>Duration (minutes)</Label>
              <Input
                id={durationId}
                type="number"
                inputMode="numeric"
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
                step={5}
                value={stage.durationMinutes ?? ""}
                disabled={disabled}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange({ durationMinutes: value ? Number(value) : null });
                }}
              />
            </div>
            {stage.kind === "interview" && (
              <p className="self-end text-xs text-[#737373]">
                Run by you or your hiring managers. To screen candidates first, add an “AI
                interview” step before this one.
              </p>
            )}
          </div>
        )}

        {stage.kind === "ai_interview" && (
          <p className="text-xs text-[#737373]">
            The AI asks the candidate 6 questions by chat and writes a report for you. Nothing is
            scheduled; the candidate gets a private link by email. You make the decision.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={instructionsId}>Instructions for the candidate (optional)</Label>
          <Textarea
            id={instructionsId}
            value={stage.instructions ?? ""}
            rows={2}
            maxLength={MAX_STAGE_INSTRUCTIONS_LENGTH}
            disabled={disabled}
            onChange={(event) => onChange({ instructions: event.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={linkId}>External link (optional)</Label>
          <Input
            id={linkId}
            type="url"
            value={stage.externalUrl ?? ""}
            placeholder="https://…"
            disabled={disabled}
            onChange={(event) => onChange({ externalUrl: event.target.value || null })}
          />
        </div>
      </div>
    </li>
  );
}
