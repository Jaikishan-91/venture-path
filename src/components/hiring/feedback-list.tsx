import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/hiring/types";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import type { FeedbackView } from "@/lib/interview-feedback";

const RECOMMENDATION_STYLES: Record<Recommendation, string> = {
  pass: "bg-[#e6f9ef] text-[#00994f]",
  fail: "bg-[#f7e6e2] text-[#a24b3a]",
  unsure: "bg-[#f5f5f5] text-[#737373]",
};

/** Notes past this length are collapsed behind a "Show more" toggle. */
const NOTES_PREVIEW_LENGTH = 220;

function RecommendationPill({ recommendation }: { recommendation: Recommendation }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${RECOMMENDATION_STYLES[recommendation]}`}
    >
      {RECOMMENDATION_LABELS[recommendation]}
    </span>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span
      aria-label={`Rating ${rating} out of 5`}
      className="shrink-0 tracking-tight text-[#7a5212]"
    >
      {"★".repeat(rating)}
      <span className="text-[#d8d3c4]">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function FeedbackNotes({ notes }: { notes: string }) {
  if (notes.length <= NOTES_PREVIEW_LENGTH) {
    return <p className="mt-2 text-sm whitespace-pre-wrap text-[#121212]">{notes}</p>;
  }
  return (
    <details className="mt-2 text-sm text-[#121212]">
      <summary className="cursor-pointer text-[#00994f] underline-offset-4 hover:underline">
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
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.eventId + item.interviewerName}
          className="min-w-0 rounded-xl bg-[#f5f5f5] p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-[#121212]">{item.stageName}</p>
              <p className="text-xs text-[#737373]">{formatIndiaDateTime(item.startsAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <RatingStars rating={item.rating} />
              <RecommendationPill recommendation={item.recommendation} />
            </div>
          </div>
          <p className="mt-2 text-xs text-[#737373]">By {item.interviewerName}</p>
          <FeedbackNotes notes={item.notes} />
        </li>
      ))}
    </ul>
  );
}
