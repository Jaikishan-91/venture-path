import type { Metadata } from "next";
import { BarList } from "@/components/dashboard/bar-list";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StatTile } from "@/components/dashboard/stat-tile";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getAdminDashboard } from "@/lib/dashboard/admin";

export const metadata: Metadata = { title: "Admin · VenturePath" };

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function AdminHomePage() {
  const session = await requireRole("admin");
  const dashboard = await getAdminDashboard();
  const { stats, reviewQueue, breakdowns, growth, ai } = dashboard;

  return (
    <RoleHome title="Admin dashboard" name={session.user.name}>
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

      <DashboardSection
        title="Review queue"
        action={{ href: "/admin/organisations", label: "Review organisations" }}
      >
        {reviewQueue.length === 0 ? (
          <EmptyState>No organisations waiting for review.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {reviewQueue.map((entry) => (
              <li
                key={entry.id}
                className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-[#f7f7f9] px-4 py-3"
              >
                <p className="truncate text-sm font-medium text-[#1b2a26]">
                  {entry.businessName} <span className="text-[#4a4d53]">· {entry.ownerName}</span>
                </p>
                <p className="truncate text-xs text-[#4a4d53]">
                  {entry.industry} · {entry.location} · waiting since {formatDate(entry.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <DashboardSection title="Growth">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-[#4a4d53]">
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
                <tr key={label} className="border-t border-[#ecedef]">
                  <th scope="row" className="py-1.5 font-medium text-[#1b2a26]">
                    {label}
                  </th>
                  <td className="py-1.5 text-right tabular-nums text-[#1b2a26]">{counts.last7}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#1b2a26]">{counts.last30}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>

      <DashboardSection title="AI analysis" action={{ href: "/admin/settings", label: "Prompts" }}>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-[#4a4d53]">Analyses</dt>
            <dd className="mt-0.5 tabular-nums text-[#1b2a26]">{ai.analysisCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#4a4d53]">Average score</dt>
            <dd className="mt-0.5 tabular-nums text-[#1b2a26]">{ai.averageScore ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#4a4d53]">Provider</dt>
            <dd className="mt-0.5 text-[#1b2a26]">
              {ai.provider.kind === "openai" ? "OpenAI" : "Disabled"}
            </dd>
          </div>
          {ai.provider.kind !== "disabled" && (
            <div className="min-w-0">
              <dt className="text-xs text-[#4a4d53]">Model</dt>
              <dd className="mt-0.5 truncate text-[#1b2a26]">{ai.provider.model}</dd>
            </div>
          )}
        </dl>
      </DashboardSection>
    </RoleHome>
  );
}
