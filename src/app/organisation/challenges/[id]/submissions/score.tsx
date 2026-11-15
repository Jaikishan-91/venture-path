import type { ChallengePlacement } from "@/lib/v2/types";

export const PLACEMENT_BADGES: Record<Exclude<ChallengePlacement, "none">, string> = {
  winner: "Winner",
  runner_up: "Runner-up",
};

/** Placement as a small green label. */
export function PlacementBadge({ placement }: { placement: ChallengePlacement }) {
  if (placement === "none") return null;
  return (
    <span className="inline-flex items-center rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[12px] font-medium whitespace-nowrap text-[#15803d]">
      {PLACEMENT_BADGES[placement]}
    </span>
  );
}

/** The AI score as the organisation sees it; students never see this. */
export function ScoreText({
  score,
  status,
  max,
}: {
  score: number | null;
  status: "pending" | "done" | "failed" | "skipped";
  max: number;
}) {
  if (score !== null) {
    return (
      <span className="inline-flex items-center rounded-md border border-[#e5e5e5] bg-white px-2 py-0.5 text-[12px] font-medium whitespace-nowrap text-[#121212] tabular-nums">
        AI score {score}/{max}
      </span>
    );
  }
  const label =
    status === "pending"
      ? "AI scoring…"
      : status === "failed"
        ? "AI score failed"
        : "AI unavailable";
  return <span className="text-[12px] whitespace-nowrap text-[#737373]">{label}</span>;
}
