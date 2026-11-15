import { Star } from "lucide-react";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/hiring/types";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import type { FeedbackView } from "@/lib/interview-feedback";

const RECOMMENDATION_STYLES: Record<Recommendation, string> = {
  pass: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
  fail: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
  unsure: "border-[#e5e5e5] bg-[#fafafa] text-[#737373]",
};

/** Notes past this length are collapsed behind a "Show more" toggle. */
const NOTES_PREVIEW_LENGTH = 220;

function RecommendationPill({ recommendation }: { recommendation: Recommendation }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${RECOMMENDATION_STYLES[recommendation]}`}
    >
      {RECOMMENDATION_LABELS[recommendation]}
    </span>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span aria-label={`Rating ${rating} out of 5`} className="inline-flex shrink-0 gap-0.5">
      {[1, 2, 3, 4, 5].map((step) => (
        <Star
          key={step}
          aria-hidden
          className={`size-3.5 ${step <= rating ? "fill-[#f59e0b] text-[#f59e0b]" : "fill-[#ececec] text-[#ececec]"}`}
        />
      ))}
    </span>
  );
}

function FeedbackNotes({ notes }: { notes: string }) {
  if (notes.length <= NOTES_PREVIEW_LENGTH) {
    return <p className="mt-2 text-sm whitespace-pre-wrap text-[#262626]">{notes}</p>;
  }
  return (
    <details className="mt-2 text-sm text-[#262626]">
      <summary className="cursor-pointer text-[#15803d] underline-offset-4 hover:underline">
        {notes.slice(0, NOTES_PREVIEW_LENGTH)}… Show more
      </summary>
      <p className="mt-2 whitespace-pre-wrap">{notes}</p>
    </details>
  );
}

/** Compact, read-only list of interview feedback for one application (WP5). Presentational only. */
export function FeedbackList({ items }: { items: FeedbackView[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[#737373]">No interview feedback yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-[#f0f0f0]">
      {items.map((item) => (
        <li key={item.eventId + item.interviewerName} className="min-w-0 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[#121212]">{item.stageName}</p>
              <p className="text-[12px] text-[#737373]">
                {formatIndiaDateTime(item.startsAt)} · By {item.interviewerName}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <RatingStars rating={item.rating} />
              <RecommendationPill recommendation={item.recommendation} />
            </div>
          </div>
          <FeedbackNotes notes={item.notes} />
        </li>
      ))}
    </ul>
  );
}
