"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  APPLICANT_SORT_LABELS,
  APPLICANT_SORTS,
  APPLIED_WINDOW_LABELS,
  APPLIED_WINDOWS,
  MIN_SCORE_OPTIONS,
  type ApplicantFilters as Filters,
} from "@/lib/applicant-filters";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm dark:bg-input/30";

/** GET form, so a filtered list has a shareable URL and works without JavaScript. */
export function ApplicantFilters({ filters, basePath }: { filters: Filters; basePath: string }) {
  const [applied, setApplied] = useState(filters.applied ?? "");

  return (
    <form
      method="get"
      action={basePath}
      aria-label="Filter applicants"
      className="grid gap-3 rounded-xl bg-[#f7f7f9] p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="minScore">Minimum score</Label>
        <select
          id="minScore"
          name="minScore"
          defaultValue={filters.minScore ?? ""}
          className={selectClass}
        >
          <option value="">Any score</option>
          {MIN_SCORE_OPTIONS.map((score) => (
            <option key={score} value={score}>
              {score}+
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="applied">Applied</Label>
        <select
          id="applied"
          name="applied"
          value={applied}
          onChange={(event) => setApplied(event.target.value)}
          className={selectClass}
        >
          <option value="">Any time</option>
          {APPLIED_WINDOWS.map((window) => (
            <option key={window} value={window}>
              {APPLIED_WINDOW_LABELS[window]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sort">Sort by</Label>
        <select id="sort" name="sort" defaultValue={filters.sort} className={selectClass}>
          {APPLICANT_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {APPLICANT_SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>
      {/* Last on phones and tablets, so the date range sits above the buttons. */}
      <div className="order-last flex gap-2 lg:order-none">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        <Link href={basePath} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Clear
        </Link>
      </div>
      {applied === "custom" && (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
          </div>
        </div>
      )}
    </form>
  );
}
