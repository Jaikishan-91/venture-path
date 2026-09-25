/** Applicant list filters for the organisation's applicants page (ADR-033). Pure, for tests. */

export const MIN_SCORE_OPTIONS = [50, 70, 85] as const;
export const APPLIED_WINDOWS = ["24h", "7d", "30d", "custom"] as const;
export type AppliedWindow = (typeof APPLIED_WINDOWS)[number];
export const APPLICANT_SORTS = ["score", "newest", "oldest"] as const;
export type ApplicantSort = (typeof APPLICANT_SORTS)[number];

export const APPLIED_WINDOW_LABELS: Record<AppliedWindow, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Date range",
};
export const APPLICANT_SORT_LABELS: Record<ApplicantSort, string> = {
  score: "Highest score",
  newest: "Newest first",
  oldest: "Oldest first",
};

export type ApplicantFilters = {
  minScore: number | null;
  applied: AppliedWindow | null;
  /** India-time dates (`YYYY-MM-DD`), used only when `applied` is `custom`. */
  from: string | null;
  to: string | null;
  sort: ApplicantSort;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) =>
  DATE_PATTERN.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
    ? value
    : null;

/** Invalid or unknown values fall back to defaults, so shared URLs never error. */
export function parseApplicantFilters(params: SearchParams): ApplicantFilters {
  const minScore = Number(first(params.minScore));
  const applied = first(params.applied);
  const sort = first(params.sort);
  let from = validDate(first(params.from));
  let to = validDate(first(params.to));
  if (from && to && from > to) [from, to] = [to, from];
  const window = APPLIED_WINDOWS.find((value) => value === applied) ?? null;
  return {
    minScore: MIN_SCORE_OPTIONS.find((value) => value === minScore) ?? null,
    applied: window === "custom" && !from && !to ? null : window,
    from: window === "custom" ? from : null,
    to: window === "custom" ? to : null,
    sort: APPLICANT_SORTS.find((value) => value === sort) ?? "score",
  };
}

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_HOURS: Record<Exclude<AppliedWindow, "custom">, number> = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
};

/** `appliedAt` bounds for the filters: `gte` inclusive, `lt` exclusive. India-time day bounds. */
export function appliedRange(
  filters: ApplicantFilters,
  now = new Date(),
): { gte?: Date; lt?: Date } | null {
  if (!filters.applied) return null;
  if (filters.applied !== "custom") {
    return { gte: new Date(now.getTime() - WINDOW_HOURS[filters.applied] * HOUR_MS) };
  }
  const range: { gte?: Date; lt?: Date } = {};
  if (filters.from) range.gte = new Date(`${filters.from}T00:00:00+05:30`);
  if (filters.to)
    range.lt = new Date(new Date(`${filters.to}T00:00:00+05:30`).getTime() + 24 * HOUR_MS);
  return range;
}

/** True when any filter narrows the list (sort alone does not). */
export const isFiltered = (filters: ApplicantFilters) =>
  filters.minScore !== null || filters.applied !== null;
