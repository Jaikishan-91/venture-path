import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/authz";
import { isRole, type Role } from "@/lib/roles";

/** A signed-in page: app shell plus a page header. `name` is shown in the sidebar. */
export async function RoleHome({
  title,
  name,
  description,
  actions,
  back,
  children,
}: {
  title: string;
  name: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  const session = await getSession();
  const role: Role = isRole(session?.user.role) ? session.user.role : "user";

  return (
    <AppShell role={role} name={name}>
      <PageHeader title={title} description={description} actions={actions} back={back} />
      {children}
    </AppShell>
  );
}
