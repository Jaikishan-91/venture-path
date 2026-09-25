import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";
import { MSME_LIST_LIMIT, countMsmesByStatus, listMsmes } from "@/lib/msme-review";
import { MSME_STATUSES, type MsmeStatus } from "@/lib/profile-schemas";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "MSME reviews · VenturePath" };

const TAB_LABELS: Record<MsmeStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const formatDate = (date: Date) =>
  date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function parseStatus(value: string | string[] | undefined): MsmeStatus {
  return MSME_STATUSES.find((status) => status === value) ?? "pending";
}

export default async function AdminMsmesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const session = await requireRole("admin");
  const status = parseStatus((await searchParams).status);
  const [profiles, counts] = await Promise.all([listMsmes(status), countMsmesByStatus()]);

  return (
    <RoleHome title="MSME reviews" name={session.user.name}>
      <nav aria-label="Status" className="flex gap-2">
        {MSME_STATUSES.map((tab) => (
          <Link
            key={tab}
            href={`/admin/msmes?status=${tab}`}
            aria-current={tab === status ? "page" : undefined}
            className="rounded-md px-3 py-1 text-sm aria-[current=page]:bg-muted aria-[current=page]:font-medium"
          >
            {TAB_LABELS[tab]} ({counts[tab]})
          </Link>
        ))}
      </nav>

      {profiles.length === 0 && <p className="text-sm text-muted-foreground">No {status} MSMEs.</p>}
      {counts[status] > MSME_LIST_LIMIT && (
        <p className="text-sm text-muted-foreground">
          Showing {MSME_LIST_LIMIT} of {counts[status]}.
        </p>
      )}

      {profiles.map((profile) => (
        <article key={profile.id} aria-label={profile.businessName}>
          <Card>
            <CardHeader>
              <CardTitle>{profile.businessName}</CardTitle>
              <CardDescription>
                {profile.industry} · {profile.location} · {profile.user.name} ({profile.user.email})
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <p className="whitespace-pre-line">{profile.description}</p>
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all underline"
                >
                  {profile.website}
                </a>
              )}
              <p className="text-muted-foreground">
                Last updated {formatDate(profile.updatedAt)}
                {profile.reviewedAt &&
                  ` · Last decision ${formatDate(profile.reviewedAt)}${
                    profile.reviewedBy ? ` by ${profile.reviewedBy.name}` : ""
                  }`}
              </p>
              {profile.rejectionReason && (
                <p className="text-muted-foreground">
                  {status === "rejected" ? "Reason" : "Previous rejection reason"}:{" "}
                  {profile.rejectionReason}
                </p>
              )}
              <ReviewActions
                profileId={profile.id}
                profileUpdatedAt={profile.updatedAt.toISOString()}
                status={profile.status}
              />
            </CardContent>
          </Card>
        </article>
      ))}
    </RoleHome>
  );
}
