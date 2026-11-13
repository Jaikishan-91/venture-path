import type { BoardInterview } from "@/lib/hiring-board-data";
import {
  INTERVIEW_RECOMMENDATION_LABELS,
  OFFER_STATUS_LABELS,
  type InterviewRecommendation,
  type OfferStatus,
} from "@/lib/v2/types";

/** Small chips for the hiring board and candidate page (owner only: they show AI scores). */

const chip =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const RECOMMENDATION: Record<InterviewRecommendation, { dot: string; className: string }> = {
  strong: { dot: "🟢", className: "bg-[#e6f9ef] text-[#00994f]" },
  maybe: { dot: "🟡", className: "bg-[#fbf3dc] text-[#6b5310]" },
  not_fit: { dot: "🔴", className: "bg-[#f8ece9] text-[#7f3326]" },
};

const INTERVIEW_STATUS: Record<BoardInterview["status"], string> = {
  invited: "AI interview: invited",
  in_progress: "AI interview: in progress",
  completed: "AI interview: done",
  expired: "AI interview: expired",
};

/** 🟢/🟡/🔴 + score when the report is ready, else where the interview is. */
export function InterviewChip({ interview }: { interview: BoardInterview | null }) {
  if (!interview) return null;
  if (interview.recommendation && interview.score !== null) {
    const style = RECOMMENDATION[interview.recommendation];
    return (
      <span
        className={`${chip} ${style.className}`}
        title={`AI interview: ${INTERVIEW_RECOMMENDATION_LABELS[interview.recommendation]} (advice only)`}
      >
        <span aria-hidden="true">{style.dot}</span>
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
  return <span className={`${chip} bg-[#f5f5f5] text-[#737373]`}>{label}</span>;
}

/** AI screening overall score, or nothing when not scored. */
export function ScreeningChip({ score }: { score: number | null }) {
  if (score === null) return null;
  return (
    <span
      className={`${chip} bg-[#f5f5f5] text-[#262626]`}
      title="AI screening score (advice only)"
    >
      Screening <span className="tabular-nums">{score}</span>
    </span>
  );
}

const OFFER_STYLE: Record<OfferStatus, string> = {
  pending: "bg-[#e8f0fb] text-[#1d4f8f]",
  accepted: "bg-[#e6f9ef] text-[#00803f]",
  declined: "bg-[#f8ece9] text-[#7f3326]",
  withdrawn: "bg-[#f5f5f5] text-[#737373]",
};

export function OfferChip({ status }: { status: OfferStatus }) {
  return <span className={`${chip} ${OFFER_STYLE[status]}`}>{OFFER_STATUS_LABELS[status]}</span>;
}

/** Plain stage / status pill. */
export function StagePill({ label }: { label: string }) {
  return <span className={`${chip} bg-[#f5f5f5] text-[#262626]`}>{label}</span>;
}
