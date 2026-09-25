import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WORK_MODE_LABELS,
  WORK_MODES,
  formatPay,
  type OpportunityType,
  type WorkMode,
} from "@/lib/opportunity-schemas";
import { listVisibleCities, searchOpportunities } from "@/lib/search";
import { browseHref, parseBrowseParams, type BrowseParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Opportunities · VenturePath" };

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30";

const TYPE_LABELS: Record<OpportunityType, string> = {
  internship: "Internship",
  freelance: "Freelance",
};

function Filters({ params, cities }: { params: BrowseParams; cities: string[] }) {
  const cityOptions =
    cities.includes(params.city ?? "") || !params.city ? cities : [params.city, ...cities];
  return (
    <form method="get" className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          name="q"
          defaultValue={params.q}
          maxLength={200}
          placeholder="Try “logo design” or “social media”"
        />
      </div>
      <div className="flex flex-wrap gap-3">
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
        <button type="submit" className={buttonVariants({ size: "sm" })}>
          Search
        </button>
        {(params.q || params.type || params.workMode || params.city) && (
          <Link
            href="/opportunities"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseBrowseParams(await searchParams);
  const [{ results, hasMore }, cities] = await Promise.all([
    searchOpportunities(params),
    listVisibleCities(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="text-sm text-muted-foreground">
          Freelance work and internships from approved MSMEs.
        </p>
      </header>
      <Filters params={params} cities={cities} />

      {results.length === 0 && (
        <p className="text-sm text-muted-foreground">No opportunities match.</p>
      )}
      {results.map((opportunity) => (
        <Link key={opportunity.id} href={`/opportunities/${opportunity.id}`} className="block">
          <Card>
            <CardHeader>
              <CardTitle>{opportunity.title}</CardTitle>
              <CardDescription>
                {opportunity.businessName} · {TYPE_LABELS[opportunity.type]} ·{" "}
                {formatPay(opportunity)} · {WORK_MODE_LABELS[opportunity.workMode as WorkMode]}
                {opportunity.city && `, ${opportunity.city}`}
              </CardDescription>
            </CardHeader>
            {opportunity.skills.length > 0 && (
              <CardContent>
                <p className="text-sm text-muted-foreground">{opportunity.skills.join(", ")}</p>
              </CardContent>
            )}
          </Card>
        </Link>
      ))}

      {(params.page > 1 || hasMore) && (
        <nav aria-label="Pages" className="flex gap-3">
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
        </nav>
      )}
    </main>
  );
}
