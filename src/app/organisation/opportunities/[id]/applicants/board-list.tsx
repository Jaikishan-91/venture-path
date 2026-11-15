"use client";

import { GitCompareArrows, X } from "lucide-react";
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

const checkboxClass = "relative z-10 size-4 shrink-0 cursor-pointer accent-[#16a34a]";

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
    <div className="flex flex-col">
      {selectable && rows.length > 1 && (
        <div className="flex items-center justify-between gap-2 border-b border-[#f0f0f0] bg-[#fafafa] px-4 py-2">
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] font-medium text-[#525252]">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={chosen.length === rows.length}
              onChange={(event) =>
                setSelected(event.target.checked ? rows.map((row) => row.id) : [])
              }
            />
            Select all
          </label>
          <span className="text-[12px] text-[#a3a3a3]">
            Pick {MIN_COMPARE}–{MAX_COMPARE} to compare
          </span>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-[#f0f0f0]" aria-label="Candidates">
        {rows.map((row) => {
          const href = `${basePath}/${row.id}${linkQuery}`;
          const checked = selected.includes(row.id);
          return (
            <li
              key={row.id}
              aria-label={row.name}
              className={`relative flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors ${
                checked ? "bg-[#f0fdf4]/60" : "hover:bg-[#fafafa]"
              }`}
            >
              {selectable && (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.name}`}
                  className={checkboxClass}
                  checked={checked}
                  onChange={() => toggle(row.id)}
                />
              )}
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-[#fafafa] text-[13px] font-semibold text-[#404040]"
              >
                {row.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-1 basis-52 flex-col gap-1.5">
                <div className="min-w-0">
                  <Link
                    href={href}
                    className="block truncate text-[14px] font-semibold text-[#121212] after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4"
                  >
                    {row.name}
                  </Link>
                  <p className="truncate text-[12px] text-[#737373]">
                    {row.course}, {row.institution} · Applied {formatApplied(row.appliedAt)}
                  </p>
                </div>
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
          className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] z-20 m-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white p-2.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.25)] md:bottom-4"
        >
          <span className="inline-flex items-center gap-2 px-1.5 text-[13px] font-semibold text-[#121212]">
            <span className="flex size-6 items-center justify-center rounded-md bg-[#121212] text-[12px] text-white tabular-nums">
              {chosen.length}
            </span>
            selected
          </span>
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-[#e5e5e5] sm:block" />
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
              <GitCompareArrows data-icon="inline-start" />
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
              <span className="text-xs text-[#737373]">Each gets a kind email.</span>
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
            className="ml-auto"
            onClick={() => {
              setSelected([]);
              setConfirmReject(false);
            }}
          >
            <X data-icon="inline-start" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
