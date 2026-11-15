import { AppSidebar } from "@/components/app-sidebar";
import type { Role } from "@/lib/roles";

/**
 * Signed-in layout: sidebar (bottom tab bar on phones) plus a centred content column. Used by
 * every role dashboard and by the shared pages (jobs, challenges) when someone is signed in, so
 * navigation never drops them back to the public site.
 */
export function AppShell({
  role,
  name,
  children,
}: {
  role: Role;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#fafafa] md:flex">
      <AppSidebar role={role} name={name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-6 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12">
          {children}
        </div>
      </div>
    </div>
  );
}
