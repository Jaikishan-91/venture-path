import { CHALLENGE_STATUS_LABELS, type ChallengeStatus } from "@/lib/v2/types";

const STYLES: Record<ChallengeStatus, { pill: string; dot: string }> = {
  draft: { pill: "bg-[#f5f5f5] text-[#525252]", dot: "bg-[#a3a3a3]" },
  open: { pill: "bg-[#f0fdf4] text-[#15803d]", dot: "bg-[#16a34a]" },
  judging: { pill: "bg-[#fffbeb] text-[#b45309]", dot: "bg-[#d97706]" },
  done: { pill: "bg-[#f5f5f5] text-[#525252]", dot: "bg-[#737373]" },
};

/** Challenge status with a colour dot; the text carries the meaning. */
export function ChallengeStatusPill({ status }: { status: ChallengeStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${style.pill}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
      {CHALLENGE_STATUS_LABELS[status]}
    </span>
  );
}
