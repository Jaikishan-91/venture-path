import { Globe, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import {
  ORGANISATION_LIST_LIMIT,
  countOrganisationsByStatus,
  listOrganisations,
} from "@/lib/organisation-review";
import { ORGANISATION_STATUSES, type OrganisationStatus } from "@/lib/profile-schemas";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Organisation reviews · Venture Path" };

const TAB_LABELS: Record<OrganisationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const formatDate = (date: Date) =>
  date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function parseStatus(value: string | string[] | undefined): OrganisationStatus {
  return ORGANISATION_STATUSES.find((status) => status === value) ?? "pending";
}

export default async function AdminOrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const session = await requireRole("admin");
  const status = parseStatus((await searchParams).status);
  const [profiles, counts] = await Promise.all([
    listOrganisations(status),
    countOrganisationsByStatus(),
  ]);

  return (
    <RoleHome
      title="Organisation reviews"
      name={session.user.name}
      description="Approve a business before its listings and challenges are shown to students."
      back={{ href: "/admin", label: "Dashboard" }}
    >
      <nav
        aria-label="Status"
        className="-mb-2 flex gap-1 overflow-x-auto border-b border-[#e5e5e5]"
      >
        {ORGANISATION_STATUSES.map((tab) => (
          <Link
            key={tab}
            href={`/admin/organisations?status=${tab}`}
            aria-current={tab === status ? "page" : undefined}
            className="-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-[14px] font-medium text-[#737373] transition-colors hover:text-[#121212] aria-[current=page]:border-[#121212] aria-[current=page]:text-[#121212]"
          >
            {TAB_LABELS[tab]}
            <span className="rounded-md bg-[#f0f0f0] px-1.5 py-0.5 text-[12px] text-[#525252] tabular-nums">
              {counts[tab]}
            </span>
          </Link>
        ))}
      </nav>

      {profiles.length === 0 && <EmptyState>No {status} organisations.</EmptyState>}
      {counts[status] > ORGANISATION_LIST_LIMIT && (
        <p className="text-[13px] text-[#737373]">
          Showing {ORGANISATION_LIST_LIMIT} of {counts[status]}.
        </p>
      )}

      {profiles.map((profile) => (
        <article
          key={profile.id}
          aria-label={profile.businessName}
          className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
        >
          <header className="flex flex-wrap items-start gap-3 px-5 pt-5">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[15px] font-semibold text-[#404040]"
            >
              {profile.businessName.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] font-semibold text-[#121212]">
                {profile.businessName}
              </h2>
              <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-[#737373]">
                <span>{profile.industry}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden className="size-3.5" />
                  {profile.location}
                </span>
              </p>
              <p className="mt-0.5 text-[13px] break-all text-[#525252]">
                {profile.user.name} ({profile.user.email})
              </p>
            </div>
            <p className="hidden text-[12px] text-[#737373] sm:block">
              Updated {formatDate(profile.updatedAt)}
            </p>
          </header>

          <div className="flex flex-col gap-3 px-5 py-4 text-[14px]">
            <p className="leading-relaxed whitespace-pre-line text-[#404040]">
              {profile.description}
            </p>
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 self-start text-[13px] break-all text-[#15803d] hover:underline"
              >
                <Globe aria-hidden className="size-3.5 shrink-0" />
                {profile.website}
              </a>
            )}
            <p className="text-[13px] text-[#737373] sm:hidden">
              Updated {formatDate(profile.updatedAt)}
            </p>
            {profile.reviewedAt && (
              <p className="text-[13px] text-[#737373]">
                Last decision {formatDate(profile.reviewedAt)}
                {profile.reviewedBy ? ` by ${profile.reviewedBy.name}` : ""}
              </p>
            )}
            {profile.rejectionReason && (
              <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#991b1b]">
                {status === "rejected" ? "Reason" : "Previous rejection reason"}:{" "}
                {profile.rejectionReason}
              </p>
            )}
          </div>

          <div className="border-t border-[#f0f0f0] bg-[#fafafa] px-5 py-4">
            <ReviewActions
              profileId={profile.id}
              profileUpdatedAt={profile.updatedAt.toISOString()}
              status={profile.status}
            />
          </div>
        </article>
      ))}
    </RoleHome>
  );
}
