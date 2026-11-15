import { ChevronRight, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/dashboard/bar-list";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StatTile } from "@/components/dashboard/stat-tile";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { getAdminDashboard } from "@/lib/dashboard/admin";

export const metadata: Metadata = { title: "Admin · Venture Path" };

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default async function AdminHomePage() {
  const session = await requireRole("admin");
  const dashboard = await getAdminDashboard();
  const { stats, reviewQueue, breakdowns, growth, ai } = dashboard;
  const firstName = session.user.name.trim().split(/\s+/)[0] || session.user.name;
  const pending = stats.organisationsPending;

  return (
    <RoleHome
      title="Admin dashboard"
      name={session.user.name}
      description={`Welcome back, ${firstName}. ${
        pending === 0
          ? "No organisations are waiting for review."
          : `${pending} ${pending === 1 ? "organisation is" : "organisations are"} waiting for review.`
      }`}
      actions={
        <Link href="/admin/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Settings data-icon="inline-start" />
          Settings
        </Link>
      }
    >
      <StatGrid>
        <StatTile label="Users" value={stats.users} />
        <StatTile
          label="Organisations"
          value={stats.organisationsTotal}
          hint={`${stats.organisationsPending} pending`}
          href="/admin/organisations"
          tone={stats.organisationsPending > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Listings"
          value={stats.listingsTotal}
          hint={`${stats.listingsPublished} published`}
        />
        <StatTile label="Applications" value={stats.applicationsTotal} />
      </StatGrid>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DashboardSection
            title="Review queue"
            description="Oldest first"
            action={{ href: "/admin/organisations", label: "Review organisations" }}
          >
            {reviewQueue.length === 0 ? (
              <EmptyState>No organisations waiting for review.</EmptyState>
            ) : (
              <ul className="-my-2.5 flex flex-col divide-y divide-[#f0f0f0]">
                {reviewQueue.map((entry) => (
                  <li key={entry.id} className="flex min-w-0 items-center gap-3 py-2.5">
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[13px] font-semibold text-[#404040]"
                    >
                      {entry.businessName.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[#121212]">
                        {entry.businessName}{" "}
                        <span className="font-normal text-[#737373]">· {entry.ownerName}</span>
                      </p>
                      <p className="truncate text-[13px] text-[#737373]">
                        {entry.industry} · {entry.location}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-[12px] font-medium text-[#b45309] sm:inline">
                      Waiting since {formatDate(entry.updatedAt)}
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-[#d4d4d4]" />
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <DashboardSection title="Users by role">
              <BarList items={breakdowns.usersByRole} />
            </DashboardSection>
            <DashboardSection title="Organisations by status">
              <BarList items={breakdowns.organisationsByStatus} />
            </DashboardSection>
            <DashboardSection title="Listings by status">
              <BarList items={breakdowns.listingsByStatus} />
            </DashboardSection>
            <DashboardSection title="Application outcomes">
              <BarList items={breakdowns.applicationOutcomes} />
            </DashboardSection>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <DashboardSection title="Growth" description="New in the last 7 and 30 days">
            <table className="-my-1 w-full text-left text-[14px]">
              <thead>
                <tr className="text-[12px] text-[#737373]">
                  <th scope="col" className="py-1.5 font-normal">
                    New
                  </th>
                  <th scope="col" className="py-1.5 text-right font-normal">
                    7 days
                  </th>
                  <th scope="col" className="py-1.5 text-right font-normal">
                    30 days
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Users", growth.users],
                    ["Organisations", growth.organisations],
                    ["Listings", growth.listings],
                    ["Applications", growth.applications],
                  ] as const
                ).map(([label, counts]) => (
                  <tr key={label} className="border-t border-[#f0f0f0]">
                    <th scope="row" className="py-2 font-medium text-[#121212]">
                      {label}
                    </th>
                    <td className="py-2 text-right text-[#121212] tabular-nums">{counts.last7}</td>
                    <td className="py-2 text-right text-[#737373] tabular-nums">{counts.last30}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DashboardSection>

          <DashboardSection
            title="AI analysis"
            action={{ href: "/admin/settings", label: "Prompts" }}
          >
            <dl className="-my-1 flex flex-col divide-y divide-[#f0f0f0] text-[14px]">
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-[#737373]">Analyses</dt>
                <dd className="text-[#121212] tabular-nums">{ai.analysisCount}</dd>
              </div>
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-[#737373]">Average score</dt>
                <dd className="text-[#121212] tabular-nums">{ai.averageScore ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-[#737373]">Provider</dt>
                <dd className="flex items-center gap-1.5 text-[#121212]">
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${
                      ai.provider.kind === "openai" ? "bg-[#16a34a]" : "bg-[#a3a3a3]"
                    }`}
                  />
                  {ai.provider.kind === "openai" ? "OpenAI" : "Disabled"}
                </dd>
              </div>
              {ai.provider.kind !== "disabled" && (
                <div className="flex min-w-0 justify-between gap-3 py-2">
                  <dt className="shrink-0 text-[#737373]">Model</dt>
                  <dd className="truncate font-mono text-[13px] text-[#121212]">
                    {ai.provider.model}
                  </dd>
                </div>
              )}
            </dl>
          </DashboardSection>
        </div>
      </div>
    </RoleHome>
  );
}
