/**
 * Hiring board (plan 2026-11-12-hiring-and-ai-interview-v2, Part 1): which tab a candidate is on,
 * what their one "next step" is, and how a tab is searched and sorted. Pure and client-safe; the
 * database side is `hiring-board-data.ts`.
 */
import type { StageKind } from "./hiring/types";
import type { BoardTab, OfferStatus } from "./v2/types";

export type BoardStage = {
  id: string;
  name: string;
  kind: StageKind;
  durationMinutes?: number | null;
};

/** What the board needs to place a candidate. */
export type BoardPlacement = {
  status: "submitted" | "accepted" | "rejected" | "withdrawn";
  currentStageId: string | null;
  offerStatus: OfferStatus | null;
};

/** A tab as a URL-safe string: "applied", "offer", "hired", "not_selected" or a stage id. */
export type TabKey = string;

export const tabKey = (tab: BoardTab): TabKey => (typeof tab === "string" ? tab : tab.stageId);

/**
 * The board tab of a candidate (see `BoardTab`), or null for withdrawn applications (not shown).
 * A pending or declined offer wins over the stage; a stage that no longer exists falls back to
 * "applied" so nobody disappears from the board.
 */
export function boardTabOf(
  placement: BoardPlacement,
  stages: readonly BoardStage[],
): BoardTab | null {
  if (placement.status === "withdrawn") return null;
  if (placement.status === "accepted") return "hired";
  if (placement.status === "rejected") return "not_selected";
  if (placement.offerStatus === "pending" || placement.offerStatus === "declined") return "offer";
  if (placement.currentStageId && stages.some((stage) => stage.id === placement.currentStageId)) {
    return { stageId: placement.currentStageId };
  }
  return "applied";
}

/** Tabs in board order: Applied · each stage · Offer · Hired · Not selected. */
export function boardTabs(stages: readonly BoardStage[]): { key: TabKey; label: string }[] {
  return [
    { key: "applied", label: "Applied" },
    ...stages.map((stage) => ({ key: stage.id, label: stage.name })),
    { key: "offer", label: "Offer" },
    { key: "hired", label: "Hired" },
    { key: "not_selected", label: "Not selected" },
  ];
}

/** Counts per tab key (every tab present, zero-filled). */
export function countByTab(
  placements: readonly BoardPlacement[],
  stages: readonly BoardStage[],
): Record<TabKey, number> {
  const counts: Record<TabKey, number> = {};
  for (const tab of boardTabs(stages)) counts[tab.key] = 0;
  for (const placement of placements) {
    const tab = boardTabOf(placement, stages);
    if (tab) counts[tabKey(tab)] += 1;
  }
  return counts;
}

/** The earliest non-empty tab, or "applied" when the board is empty. */
export function defaultTab(counts: Record<TabKey, number>, stages: readonly BoardStage[]): TabKey {
  return boardTabs(stages).find((tab) => (counts[tab.key] ?? 0) > 0)?.key ?? "applied";
}

export const BOARD_SORTS = ["best", "newest"] as const;
export type BoardSort = (typeof BOARD_SORTS)[number];
export const BOARD_SORT_LABELS: Record<BoardSort, string> = {
  best: "Best match",
  newest: "Newest",
};
export const MAX_BOARD_SEARCH_LENGTH = 100;

export type BoardParams = { tab: TabKey | null; q: string; sort: BoardSort };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** Board URL params. Unknown tabs become null (the caller picks the default), so old links never error. */
export function parseBoardParams(params: SearchParams, stages: readonly BoardStage[]): BoardParams {
  const tab = first(params.tab);
  const sort = first(params.sort);
  return {
    tab: boardTabs(stages).some((candidate) => candidate.key === tab) ? tab : null,
    q: first(params.q).slice(0, MAX_BOARD_SEARCH_LENGTH),
    sort: BOARD_SORTS.find((value) => value === sort) ?? "best",
  };
}

/** Board URL for a tab, keeping search and sort when they differ from the defaults. */
export function boardHref(
  basePath: string,
  params: { tab?: TabKey | null; q?: string; sort?: BoardSort },
): string {
  const search = new URLSearchParams();
  if (params.tab) search.set("tab", params.tab);
  if (params.q) search.set("q", params.q);
  if (params.sort && params.sort !== "best") search.set("sort", params.sort);
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export type SortableCandidate = {
  name: string;
  appliedAt: Date;
  /** AI interview score 0–100 (`interviewScore`), null when there is no report. */
  interviewScore: number | null;
  /** AI screening overall score 0–100, null when not scored. */
  screeningScore: number | null;
};

const desc = (a: number | null, b: number | null) =>
  a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : b - a;

/**
 * "Best match": AI interview score, then AI screening score (missing scores last), then newest.
 * "Newest": applied date, newest first. Does not mutate.
 */
export function sortCandidates<T extends SortableCandidate>(
  rows: readonly T[],
  sort: BoardSort,
): T[] {
  const newest = (a: T, b: T) => b.appliedAt.getTime() - a.appliedAt.getTime();
  return [...rows].sort((a, b) =>
    sort === "newest"
      ? newest(a, b)
      : desc(a.interviewScore, b.interviewScore) ||
        desc(a.screeningScore, b.screeningScore) ||
        newest(a, b),
  );
}

/** Case-insensitive name search; empty query matches everyone. */
export function matchesSearch(name: string, q: string): boolean {
  const query = q.trim().toLowerCase();
  return query === "" || name.toLowerCase().includes(query);
}

export type NextStep =
  | { kind: "send_ai_interview"; stage: BoardStage }
  | { kind: "move"; stage: BoardStage }
  | { kind: "make_offer" }
  | { kind: "offer_pending" }
  | { kind: "offer_declined" }
  | { kind: "none" };

/**
 * The one "next step" for a candidate (D2, D3): the next pipeline stage ("Send AI interview" when
 * it is an AI interview), "Make offer" at the last stage (or at Applied when the listing has no
 * steps), and the offer's state on the Offer tab. Decided candidates have none.
 */
export function nextStepFor(placement: BoardPlacement, stages: readonly BoardStage[]): NextStep {
  const tab = boardTabOf(placement, stages);
  if (tab === null || tab === "hired" || tab === "not_selected") return { kind: "none" };
  if (tab === "offer") {
    return placement.offerStatus === "pending"
      ? { kind: "offer_pending" }
      : { kind: "offer_declined" };
  }
  const index = tab === "applied" ? -1 : stages.findIndex((stage) => stage.id === tab.stageId);
  const next = stages[index + 1];
  if (!next) return { kind: "make_offer" };
  return next.kind === "ai_interview"
    ? { kind: "send_ai_interview", stage: next }
    : { kind: "move", stage: next };
}

/** Button text for a next step that is an action (null for none and offer states). */
export function nextStepLabel(step: NextStep): string | null {
  switch (step.kind) {
    case "send_ai_interview":
      return "Send AI interview";
    case "move":
      return `Move to ${step.stage.name}`;
    case "make_offer":
      return "Make offer";
    case "offer_declined":
      return "New offer";
    default:
      return null;
  }
}

/** Previous / next candidate ids around `id` in an ordered list (null at the ends or when absent). */
export function neighbours(
  ids: readonly string[],
  id: string,
): { previous: string | null; next: string | null } {
  const index = ids.indexOf(id);
  if (index === -1) return { previous: null, next: null };
  return { previous: ids[index - 1] ?? null, next: ids[index + 1] ?? null };
}
