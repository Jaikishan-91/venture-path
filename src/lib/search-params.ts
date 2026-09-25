import {
  OPPORTUNITY_TYPES,
  WORK_MODES,
  type OpportunityType,
  type WorkMode,
} from "./opportunity-schemas";

export const MAX_QUERY_LENGTH = 200;
export const MAX_PAGE = 500;

export type BrowseParams = {
  q: string;
  type: OpportunityType | null;
  workMode: WorkMode | null;
  city: string | null;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** Invalid or unknown values are ignored rather than rejected, so shared URLs never error. */
export function parseBrowseParams(params: SearchParams): BrowseParams {
  const type = first(params.type);
  const workMode = first(params.workMode);
  const page = Number(first(params.page));
  return {
    q: first(params.q).slice(0, MAX_QUERY_LENGTH),
    type: OPPORTUNITY_TYPES.find((value) => value === type) ?? null,
    workMode: WORK_MODES.find((value) => value === workMode) ?? null,
    city: first(params.city).slice(0, 80) || null,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Builds a `/opportunities` URL, dropping empty values. */
export function browseHref(params: Partial<BrowseParams>): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.type) query.set("type", params.type);
  if (params.workMode) query.set("workMode", params.workMode);
  if (params.city) query.set("city", params.city);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const search = query.toString();
  return search ? `/opportunities?${search}` : "/opportunities";
}
