import { AppSidebar } from "@/components/app-sidebar";
import { getSession } from "@/lib/authz";
import { isRole, type Role } from "@/lib/roles";

export async function RoleHome({
  title,
  name,
  children,
}: {
  title: string;
  name: string;
  children?: React.ReactNode;
}) {
  const session = await getSession();
  const role: Role = isRole(session?.user.role) ? session.user.role : "student";

  return (
    <div className="mx-auto w-full max-w-[1280px] px-3.5 py-7">
      <div className="overflow-hidden rounded-[28px] bg-[#f7f7f9] shadow-[0_18px_40px_-28px_rgba(22,24,29,0.28)] md:flex md:min-h-[calc(100dvh-3.5rem)]">
        <AppSidebar role={role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-[#ecedef] px-6 py-5">
            <h1 className="text-3xl font-medium tracking-tight text-[#26594a]">{title}</h1>
            <p className="text-sm text-[#4a4d53]">Signed in as {name}</p>
          </header>
          <div className="flex flex-1 flex-col gap-6 px-6 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
