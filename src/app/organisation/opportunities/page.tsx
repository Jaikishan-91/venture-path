import { Briefcase, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { listOwnOpportunities } from "@/lib/opportunities";
import {
  WORK_MODE_LABELS,
  formatPay,
  isDeadlinePassed,
  type OpportunityStatus,
} from "@/lib/opportunity-schemas";
import { getOrganisationProfile } from "@/lib/profiles";
import { OpportunityActions } from "./opportunity-actions";

export const metadata: Metadata = { title: "Your listings · Venture Path" };

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

const STATUS_STYLES: Record<OpportunityStatus, { text: string; dot: string }> = {
  draft: { text: "text-[#525252]", dot: "bg-[#a3a3a3]" },
  published: { text: "text-[#15803d]", dot: "bg-[#16a34a]" },
  closed: { text: "text-[#737373]", dot: "bg-[#d4d4d4]" },
};

const formatDeadline = (deadline: Date) =>
  deadline.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" });

export default async function OrganisationOpportunitiesPage() {
  const session = await requireRole("organisation");
  const [profile, opportunities] = await Promise.all([
    getOrganisationProfile(session.user.id),
    listOwnOpportunities(session.user.id),
  ]);
  const approved = profile?.status === "approved";
  const counts = {
    published: opportunities.filter((o) => o.status === "published").length,
    draft: opportunities.filter((o) => o.status === "draft").length,
    closed: opportunities.filter((o) => o.status === "closed").length,
  };

  return (
    <RoleHome
      title="Your listings"
      name={session.user.name}
      description={
        opportunities.length > 0
          ? `${counts.published} published · ${counts.draft} ${counts.draft === 1 ? "draft" : "drafts"} · ${counts.closed} closed`
          : "Internships and freelance work you post for students."
      }
      actions={
        approved ? (
          <Link href="/organisation/opportunities/new" className={buttonVariants({ size: "sm" })}>
            <Plus data-icon="inline-start" />
            New listing
          </Link>
        ) : undefined
      }
    >
      {!approved && (
        <p
          role="status"
          className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[14px] text-[#92400e]"
        >
          {profile
            ? "Your business needs admin approval before you can create, edit or publish listings. Users can't see your listings until then."
            : "Create your business profile and get it approved to post listings."}
        </p>
      )}

      {opportunities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#d4d4d4] bg-white px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#737373]">
            <Briefcase aria-hidden className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold text-[#121212]">No listings yet.</p>
            <p className="max-w-sm text-[14px] text-[#737373]">
              Post an internship or a paid freelance job. It stays a draft until you publish it.
            </p>
          </div>
          {approved && (
            <Link
              href="/organisation/opportunities/new"
              className={buttonVariants({ size: "sm", className: "mt-1" })}
            >
              Create a listing
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
          {opportunities.map((opportunity) => {
            const status = STATUS_STYLES[opportunity.status];
            const passed = opportunity.deadline ? isDeadlinePassed(opportunity.deadline) : false;
            return (
              <article
                key={opportunity.id}
                aria-label={opportunity.title}
                className="flex flex-col gap-3 border-b border-[#f0f0f0] px-5 py-4 last:border-b-0 lg:flex-row lg:items-center lg:gap-6"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#737373]"
                  >
                    <Briefcase className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-[#121212]">
                      {opportunity.title}
                    </h2>
                    {/* One text run: tests read "Internship · Draft · ₹15,000 / month · Hybrid, Pune". */}
                    <p className="mt-0.5 text-[13px] text-[#737373]">
                      {opportunity.type === "internship" ? "Internship" : "Freelance"} ·{" "}
                      <span className={`font-medium ${status.text}`}>
                        <span
                          aria-hidden
                          className={`mr-1 mb-px inline-block size-1.5 rounded-full align-middle ${status.dot}`}
                        />
                        {STATUS_LABELS[opportunity.status]}
                      </span>{" "}
                      · {formatPay(opportunity)} · {WORK_MODE_LABELS[opportunity.workMode]}
                      {opportunity.city && `, ${opportunity.city}`}
                    </p>
                    <p
                      className={`mt-1 text-[12px] ${passed ? "font-medium text-[#b45309]" : "text-[#a3a3a3]"}`}
                    >
                      {opportunity.deadline
                        ? `Apply by ${formatDeadline(opportunity.deadline)}${passed ? " · Deadline passed" : ""}`
                        : "No deadline"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-12 lg:pl-0">
                  <Link
                    href={`/organisation/opportunities/${opportunity.id}/applicants`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Users data-icon="inline-start" />
                    Applicants
                  </Link>
                  <OpportunityActions
                    id={opportunity.id}
                    status={opportunity.status}
                    canEdit={approved}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </RoleHome>
  );
}
