import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { WORK_MODE_LABELS } from "@/lib/opportunity-schemas";
import { recommendOpportunities } from "@/lib/recommendations";

export const metadata: Metadata = { title: "Recommended jobs · Venture Path" };

const RECOMMENDATIONS_TAKE = 30;

const formatDeadline = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

const SOURCE_TEXT = {
  resumes: "Based on the skills in your resumes.",
  profile: "Based on the skills in your profile. Add a resume to improve these matches.",
  none: "Add a resume or skills to your profile to get job recommendations.",
} as const;

export default async function RecommendationsPage() {
  const session = await requireRole("user");
  const { items, source } = await recommendOpportunities(session.user.id, RECOMMENDATIONS_TAKE);

  return (
    <RoleHome
      title="Recommended for you"
      name={session.user.name}
      back={{ href: "/user", label: "Dashboard" }}
      description={SOURCE_TEXT[source]}
      actions={
        source === "resumes" ? null : (
          <>
            <Link
              href="/user/profile"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit profile
            </Link>
            <Link href="/user/resumes" className={buttonVariants({ size: "sm" })}>
              Add a resume
            </Link>
          </>
        )
      }
    >
      {source !== "none" && items.length === 0 && (
        <EmptyState>
          No open listings match your skills right now.{" "}
          <Link href="/opportunities" className="underline">
            Browse all opportunities
          </Link>
          .
        </EmptyState>
      )}

      {items.length > 0 && (
        <DashboardSection
          title={`${items.length} ${items.length === 1 ? "match" : "matches"}`}
          description="Best match first"
          action={{ href: "/opportunities", label: "All jobs" }}
        >
          <ul
            className="-my-3 flex flex-col divide-y divide-[#f0f0f0]"
            aria-label="Recommended jobs"
          >
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/opportunities/${item.id}`}
                  className="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3.5 transition-colors hover:bg-[#fafafa]"
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[14px] font-semibold text-[#404040]"
                  >
                    {item.businessName.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[#121212] group-hover:underline group-hover:underline-offset-4">
                      {item.title}
                    </span>
                    <span className="block truncate text-[13px] text-[#737373]">
                      {item.businessName} · {WORK_MODE_LABELS[item.workMode]}
                      {item.city && `, ${item.city}`}
                      {item.deadline && ` · Apply by ${formatDeadline(item.deadline)}`}
                    </span>
                    {item.requiredSkills.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[#737373]">
                        You have {item.matchedSkills.length} of {item.requiredSkills.length} skills
                        {item.matchedSkills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-md bg-[#f0fdf4] px-1.5 py-0.5 font-medium text-[#15803d]"
                          >
                            {skill}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="flex w-20 shrink-0 flex-col items-end gap-1">
                    <span className="text-[14px] font-semibold text-[#15803d] tabular-nums">
                      {item.match}% match
                    </span>
                    <span
                      aria-hidden
                      className="h-1 w-full overflow-hidden rounded-full bg-[#f0f0f0]"
                    >
                      <span
                        className="block h-full rounded-full bg-[#16a34a]"
                        style={{ width: `${item.match}%` }}
                      />
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="hidden size-4 shrink-0 text-[#d4d4d4] transition-colors group-hover:text-[#121212] sm:block"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>
      )}
    </RoleHome>
  );
}
