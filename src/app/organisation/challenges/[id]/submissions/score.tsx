import type { ChallengePlacement } from "@/lib/v2/types";

export const PLACEMENT_BADGES: Record<Exclude<ChallengePlacement, "none">, string> = {
  winner: "Winner",
  runner_up: "Runner-up",
};

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
      <span className="rounded-md bg-[#f5f5f5] px-2 py-0.5 text-xs font-medium">
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
  return <span className="text-xs text-muted-foreground">{label}</span>;
}
