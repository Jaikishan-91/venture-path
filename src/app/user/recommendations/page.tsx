import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { WORK_MODE_LABELS } from "@/lib/opportunity-schemas";
import { recommendOpportunities } from "@/lib/recommendations";

export const metadata: Metadata = { title: "Recommended jobs · Venture Path" };

const RECOMMENDATIONS_TAKE = 30;

const formatDeadline = (date: Date) =>
  date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" });

const SOURCE_TEXT = {
  resumes: "Based on the skills in your resumes.",
  profile: "Based on the skills in your profile. Add a resume to improve these matches.",
  none: null,
} as const;

export default async function RecommendationsPage() {
  const session = await requireRole("user");
  const { items, source } = await recommendOpportunities(session.user.id, RECOMMENDATIONS_TAKE);

  return (
    <RoleHome title="Recommended for you" name={session.user.name}>
      {source === "none" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[#737373]">
            Add a resume or skills to your profile to get job recommendations.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/user/resumes" className={buttonVariants()}>
              Add a resume
            </Link>
            <Link href="/user/profile" className={buttonVariants({ variant: "outline" })}>
              Edit profile
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[#737373]">{SOURCE_TEXT[source]}</p>
      )}

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
        <ul className="flex flex-col gap-3" aria-label="Recommended jobs">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 flex-col gap-2 rounded-2xl bg-white p-4 border border-[#e5e5e5] shadow-card"
            >
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/opportunities/${item.id}`}
                  className="min-w-0 truncate font-medium text-[#121212] underline-offset-4 hover:underline"
                >
                  {item.title}
                </Link>
                <span className="text-sm font-medium tabular-nums text-[#00994f]">
                  {item.match}% match
                </span>
              </div>
              <p className="truncate text-sm text-[#737373]">
                {item.businessName} · {WORK_MODE_LABELS[item.workMode]}
                {item.city && `, ${item.city}`}
                {item.deadline && ` · Apply by ${formatDeadline(item.deadline)}`}
              </p>
              {item.requiredSkills.length > 0 && (
                <p className="text-xs text-[#737373]">
                  You have {item.matchedSkills.length} of {item.requiredSkills.length} skills
                  {item.matchedSkills.length > 0 && `: ${item.matchedSkills.join(", ")}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </RoleHome>
  );
}
