import { ChevronRight, MapPin, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PublicFrame } from "@/components/public-frame";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/authz";
import {
  WORK_MODE_LABELS,
  WORK_MODES,
  formatPay,
  type OpportunityType,
  type WorkMode,
} from "@/lib/opportunity-schemas";
import { isRole } from "@/lib/roles";
import { listVisibleCities, searchOpportunities, type OpportunitySummary } from "@/lib/search";
import { browseHref, parseBrowseParams, type BrowseParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Opportunities · Venture Path" };

const selectClass =
  "h-10 min-w-0 cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 text-[14px] text-[#121212] outline-none transition-colors hover:border-[#d4d4d4] focus-visible:border-[#121212] focus-visible:ring-3 focus-visible:ring-[#121212]/10";

const TYPE_LABELS: Record<OpportunityType, string> = {
  internship: "Internship",
  freelance: "Freelance",
};

/** Deadlines are `@db.Date` (UTC midnight). */
const formatDeadline = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

const postedAgo = (date: Date | null) => {
  if (!date) return null;
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  return days === 0 ? "Posted today" : days === 1 ? "Posted yesterday" : `Posted ${days} days ago`;
};

function Filters({ params, cities }: { params: BrowseParams; cities: string[] }) {
  const cityOptions =
    cities.includes(params.city ?? "") || !params.city ? cities : [params.city, ...cities];
  const filtered = Boolean(params.q || params.type || params.workMode || params.city);
  return (
    <form
      method="get"
      role="search"
      className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-2 lg:flex-row lg:items-center"
    >
      <div className="relative min-w-0 flex-1">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#a3a3a3]"
        />
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={params.q}
          maxLength={200}
          placeholder="Try “logo design” or “social media”"
          className="h-10 w-full rounded-lg border border-transparent bg-[#fafafa] pr-3 pl-9 text-[14px] text-[#121212] outline-none placeholder:text-[#a3a3a3] focus-visible:border-[#121212] focus-visible:bg-white focus-visible:ring-3 focus-visible:ring-[#121212]/10"
        />
      </div>
      <div className="grid grid-cols-3 gap-2 lg:flex lg:shrink-0">
        <select
          name="type"
          defaultValue={params.type ?? ""}
          aria-label="Type"
          className={selectClass}
        >
          <option value="">Any type</option>
          <option value="internship">Internship</option>
          <option value="freelance">Freelance</option>
        </select>
        <select
          name="workMode"
          defaultValue={params.workMode ?? ""}
          aria-label="Work mode"
          className={selectClass}
        >
          <option value="">Any work mode</option>
          {WORK_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {WORK_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
        <select
          name="city"
          defaultValue={params.city ?? ""}
          aria-label="City"
          className={selectClass}
        >
          <option value="">Any city</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 lg:shrink-0">
        <button type="submit" className={buttonVariants({ className: "flex-1 lg:flex-none" })}>
          Search
        </button>
        {filtered && (
          <Link href="/opportunities" className={buttonVariants({ variant: "ghost" })}>
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

function ResultRow({ opportunity }: { opportunity: OpportunitySummary }) {
  const mode = WORK_MODE_LABELS[opportunity.workMode as WorkMode];
  const location = opportunity.city ? `${mode} · ${opportunity.city}` : mode;
  const posted = postedAgo(opportunity.publishedAt);
  return (
    <li className="border-b border-[#f0f0f0] last:border-b-0">
      <Link
        href={`/opportunities/${opportunity.id}`}
        className="group flex gap-4 px-4 py-4 transition-colors hover:bg-[#fafafa] md:px-5"
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[15px] font-semibold text-[#404040]"
        >
          {opportunity.businessName.trim().charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] leading-snug font-semibold text-[#121212] group-hover:underline group-hover:underline-offset-4">
              {opportunity.title}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-[#737373]">
              <span className="truncate">{opportunity.businessName}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3 shrink-0" />
                {location}
              </span>
            </span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            <span className="rounded-md bg-[#f5f5f5] px-2 py-0.5 text-[12px] font-medium text-[#404040]">
              {TYPE_LABELS[opportunity.type]}
            </span>
            <span className="rounded-md bg-[#f0fdf4] px-2 py-0.5 text-[12px] font-medium text-[#15803d]">
              {formatPay(opportunity)}
            </span>
            {opportunity.skills.slice(0, 2).map((skill) => (
              <span
                key={skill}
                className="rounded-md border border-[#e5e5e5] px-2 py-0.5 text-[12px] text-[#525252]"
              >
                {skill}
              </span>
            ))}
            {opportunity.skills.length > 2 && (
              <span className="px-1 py-0.5 text-[12px] text-[#737373]">
                +{opportunity.skills.length - 2}
              </span>
            )}
          </span>
          {/* Phones: dates under the chips; wider screens show them in the right column. */}
          <span className="flex flex-wrap gap-x-3 text-[12px] text-[#737373] sm:hidden">
            {posted && <span>{posted}</span>}
            {opportunity.deadline && <span>Apply by {formatDeadline(opportunity.deadline)}</span>}
          </span>
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-1 text-[12px] text-[#737373] sm:flex">
          {posted && <span>{posted}</span>}
          {opportunity.deadline && (
            <span className="font-medium text-[#404040]">
              Apply by {formatDeadline(opportunity.deadline)}
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="hidden size-4 shrink-0 self-center text-[#d4d4d4] transition-colors group-hover:text-[#121212] sm:block"
        />
      </Link>
    </li>
  );
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseBrowseParams(await searchParams);
  const [{ results, hasMore }, cities, session] = await Promise.all([
    searchOpportunities(params),
    listVisibleCities(),
    getSession(),
  ]);
  // Inside the app shell the column is already padded; the public frame needs its own gutter.
  const inApp = Boolean(session && isRole(session.user.role));
  const filtered = Boolean(params.q || params.type || params.workMode || params.city);
  const count = `${results.length}${hasMore ? "+" : ""}`;
  const noun = results.length === 1 && !hasMore ? "opening" : "openings";

  return (
    <PublicFrame appShell>
      <main className={`flex flex-col gap-5 ${inApp ? "" : "px-4 py-8 md:px-8 md:py-10"}`}>
        <PageHeader
          title="Opportunities"
          description={
            results.length > 0
              ? `${count} ${noun}${params.page > 1 ? ` on page ${params.page}` : ""} · freelance work and internships from approved organisations.`
              : "Freelance work and internships from approved organisations."
          }
        />
        <Filters params={params} cities={cities} />

        {results.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#d4d4d4] bg-white px-4 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-[#f5f5f5] text-[#737373]">
              <Search aria-hidden className="size-4" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-medium text-[#121212]">No opportunities match.</p>
              <p className="text-[13px] text-[#737373]">
                {filtered
                  ? "Try fewer words or remove a filter."
                  : "New listings are posted every week. Check back soon."}
              </p>
            </div>
            {filtered && (
              <Link
                href="/opportunities"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Clear filters
              </Link>
            )}
          </div>
        )}
        {results.length > 0 && (
          <ul
            aria-label="Opportunities"
            className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
          >
            {results.map((opportunity) => (
              <ResultRow key={opportunity.id} opportunity={opportunity} />
            ))}
          </ul>
        )}

        {(params.page > 1 || hasMore) && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-[#737373]">Page {params.page}</span>
            <span className="flex gap-2">
              {params.page > 1 && (
                <Link
                  href={browseHref({ ...params, page: params.page - 1 })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Previous
                </Link>
              )}
              {hasMore && (
                <Link
                  href={browseHref({ ...params, page: params.page + 1 })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Next
                </Link>
              )}
            </span>
          </nav>
        )}
      </main>
    </PublicFrame>
  );
}
