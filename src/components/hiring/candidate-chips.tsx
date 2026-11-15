import type { BoardInterview } from "@/lib/hiring-board-data";
import {
  INTERVIEW_RECOMMENDATION_LABELS,
  OFFER_STATUS_LABELS,
  type InterviewRecommendation,
  type OfferStatus,
} from "@/lib/v2/types";

/** Small chips for the hiring board and candidate page (owner only: they show AI scores). */

const chip =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[12px] font-medium whitespace-nowrap";

const RECOMMENDATION: Record<InterviewRecommendation, { dot: string; className: string }> = {
  strong: { dot: "bg-[#16a34a]", className: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" },
  maybe: { dot: "bg-[#d97706]", className: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]" },
  not_fit: { dot: "bg-[#dc2626]", className: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]" },
};

const INTERVIEW_STATUS: Record<BoardInterview["status"], string> = {
  invited: "AI interview: invited",
  in_progress: "AI interview: in progress",
  completed: "AI interview: done",
  expired: "AI interview: expired",
};

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${className}`} />;
}

/** Coloured dot + score when the report is ready, else where the interview is. */
export function InterviewChip({ interview }: { interview: BoardInterview | null }) {
  if (!interview) return null;
  if (interview.recommendation && interview.score !== null) {
    const style = RECOMMENDATION[interview.recommendation];
    return (
      <span
        className={`${chip} ${style.className}`}
        title={`AI interview: ${INTERVIEW_RECOMMENDATION_LABELS[interview.recommendation]} (advice only)`}
      >
        <Dot className={style.dot} />
        <span>
          AI interview <span className="tabular-nums">{interview.score}</span>/100
        </span>
      </span>
    );
  }
  const label =
    interview.status === "completed"
      ? interview.reportStatus === "failed"
        ? "AI interview: report failed"
        : "AI interview: writing report"
      : INTERVIEW_STATUS[interview.status];
  return (
    <span className={`${chip} border-[#e5e5e5] bg-[#fafafa] text-[#737373]`}>
      <Dot
        className={
          interview.status === "in_progress" ? "bg-[#2563eb]" : "border border-[#a3a3a3] bg-white"
        }
      />
      {label}
    </span>
  );
}

/** AI screening overall score, or nothing when not scored. */
export function ScreeningChip({ score }: { score: number | null }) {
  if (score === null) return null;
  return (
    <span
      className={`${chip} border-[#e5e5e5] bg-white text-[#404040]`}
      title="AI screening score (advice only)"
    >
      Screening <span className="font-semibold text-[#121212] tabular-nums">{score}</span>
    </span>
  );
}

const OFFER_STYLE: Record<OfferStatus, string> = {
  pending: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  accepted: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
  declined: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
  withdrawn: "border-[#e5e5e5] bg-[#fafafa] text-[#737373]",
};

export function OfferChip({ status }: { status: OfferStatus }) {
  return <span className={`${chip} ${OFFER_STYLE[status]}`}>{OFFER_STATUS_LABELS[status]}</span>;
}

/** Plain stage / status pill. */
export function StagePill({ label }: { label: string }) {
  return <span className={`${chip} border-[#e5e5e5] bg-[#fafafa] text-[#262626]`}>{label}</span>;
}
