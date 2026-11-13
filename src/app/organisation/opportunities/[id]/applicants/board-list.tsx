"use client";

import Link from "next/link";
import { useState } from "react";
import { InterviewChip, OfferChip, ScreeningChip } from "@/components/hiring/candidate-chips";
import { ProofBadge } from "@/components/proof/proof-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { nextStepLabel, type NextStep } from "@/lib/hiring-board";
import type { BoardInterview } from "@/lib/hiring-board-data";
import { MAX_COMPARE, MIN_COMPARE, type OfferStatus, type ProofLevel } from "@/lib/v2/types";
import { advanceAction, bulkNotSelectedAction, withdrawOfferAction } from "./actions";
import { sendAiInterviewAction } from "./ai-interview-actions";

export type BoardRowView = {
  id: string;
  name: string;
  course: string;
  institution: string;
  appliedAt: Date;
  currentStageId: string | null;
  offerStatus: OfferStatus | null;
  bestProofLevel: ProofLevel | null;
  screeningScore: number | null;
  interview: BoardInterview | null;
  nextStep: NextStep;
};

const formatApplied = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function NextStepButton({ row, candidateHref }: { row: BoardRowView; candidateHref: string }) {
  const step = row.nextStep;
  const label = nextStepLabel(step);
  if (step.kind === "send_ai_interview" || step.kind === "move") {
    return (
      <form action={advanceAction}>
        <input type="hidden" name="applicationId" value={row.id} />
        <input type="hidden" name="expectedStageId" value={row.currentStageId ?? ""} />
        <input type="hidden" name="nextKind" value={step.stage.kind} />
        <Button type="submit" size="sm">
          {label}
        </Button>
      </form>
    );
  }
  if (step.kind === "make_offer" || step.kind === "offer_declined") {
    return (
      <Link
        href={`${candidateHref}${candidateHref.includes("?") ? "&" : "?"}offer=1`}
        className={buttonVariants({ size: "sm" })}
      >
        {label}
      </Link>
    );
  }
  if (step.kind === "offer_pending") {
    return (
      <form action={withdrawOfferAction}>
        <input type="hidden" name="applicationId" value={row.id} />
        <Button type="submit" size="sm" variant="outline">
          Withdraw offer
        </Button>
      </form>
    );
  }
  return null;
}

/**
 * One tab of the board: one compact row per candidate with one next-step button, plus (when
 * `selectable`) tick boxes for bulk "Send AI interview" / "Not selected" and "Compare".
 */
export function BoardList({
  rows,
  basePath,
  linkQuery,
  opportunityId,
  selectable,
  canSendAiInterview,
}: {
  rows: BoardRowView[];
  basePath: string;
  /** `?tab=…&sort=…` so the candidate page knows its list for Previous / Next. */
  linkQuery: string;
  opportunityId: string;
  selectable: boolean;
  /** Applied tab of a listing with an AI interview step. */
  canSendAiInterview: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  const chosen = rows.filter((row) => selected.includes(row.id));
  const selectionValues = chosen.map((row) => `${row.id}|${row.currentStageId ?? ""}`);
  const canCompare = chosen.length >= MIN_COMPARE && chosen.length <= MAX_COMPARE;
  const [confirmReject, setConfirmReject] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {selectable && rows.length > 1 && (
        <label className="flex w-fit items-center gap-2 text-sm text-[#737373]">
          <input
            type="checkbox"
            checked={chosen.length === rows.length}
            onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row.id) : [])}
          />
          Select all
        </label>
      )}
      <ul className="flex flex-col gap-2" aria-label="Candidates">
        {rows.map((row) => {
          const href = `${basePath}/${row.id}${linkQuery}`;
          return (
            <li
              key={row.id}
              aria-label={row.name}
              className="relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#e5e5e5] bg-white p-3 hover:border-[#d4d4d4]"
            >
              {selectable && (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.name}`}
                  className="relative z-10 size-4"
                  checked={selected.includes(row.id)}
                  onChange={() => toggle(row.id)}
                />
              )}
              <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
                <Link
                  href={href}
                  className="truncate font-medium text-[#121212] after:absolute after:inset-0 after:content-['']"
                >
                  {row.name}
                </Link>
                <p className="truncate text-xs text-[#737373]">
                  {row.course}, {row.institution} · Applied {formatApplied(row.appliedAt)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {row.bestProofLevel && <ProofBadge level={row.bestProofLevel} />}
                  <ScreeningChip score={row.screeningScore} />
                  <InterviewChip interview={row.interview} />
                  {row.offerStatus && <OfferChip status={row.offerStatus} />}
                </div>
              </div>
              <div className="relative z-10 shrink-0">
                <NextStepButton row={row} candidateHref={href} />
              </div>
            </li>
          );
        })}
      </ul>

      {selectable && chosen.length > 0 && (
        <div
          role="region"
          aria-label="Selected candidates"
          className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]"
        >
          <span className="text-sm font-medium">{chosen.length} selected</span>
          {canSendAiInterview && (
            <form action={sendAiInterviewAction}>
              <input type="hidden" name="opportunityId" value={opportunityId} />
              {selectionValues.map((value) => (
                <input key={value} type="hidden" name="selection" value={value} />
              ))}
              <Button type="submit" size="sm">
                Send AI interview
              </Button>
            </form>
          )}
          {canCompare ? (
            <Link
              href={`${basePath}/compare?ids=${chosen.map((row) => row.id).join(",")}`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Compare ({chosen.length})
            </Link>
          ) : (
            <span className="text-xs text-[#737373]">
              Pick {MIN_COMPARE}–{MAX_COMPARE} to compare
            </span>
          )}
          {confirmReject ? (
            <form action={bulkNotSelectedAction} className="flex flex-wrap items-center gap-2">
              {selectionValues.map((value) => (
                <input key={value} type="hidden" name="selection" value={value} />
              ))}
              <span className="text-xs">Each gets a kind email.</span>
              <Button type="submit" size="sm" variant="destructive">
                Confirm not selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmReject(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmReject(true)}
            >
              Not selected
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected([]);
              setConfirmReject(false);
            }}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
