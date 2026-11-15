import { AppShell } from "@/components/app-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/authz";
import { isRole } from "@/lib/roles";

/**
 * Public pages: sticky header, a centred content column, footer. `hero` renders full-width above
 * it. With `appShell` (the shared jobs and challenges pages), signed-in people get the app sidebar
 * instead, so moving between their dashboard and these pages keeps the same navigation.
 */
export async function PublicFrame({
  hero,
  appShell = false,
  children,
}: {
  hero?: React.ReactNode;
  appShell?: boolean;
  children?: React.ReactNode;
}) {
  if (appShell) {
    const session = await getSession();
    if (session && isRole(session.user.role)) {
      return (
        <AppShell role={session.user.role} name={session.user.name}>
          {children}
        </AppShell>
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />
      {hero}
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
