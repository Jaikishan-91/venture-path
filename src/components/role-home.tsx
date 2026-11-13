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
  const role: Role = isRole(session?.user.role) ? session.user.role : "user";

  return (
    <div className="min-h-dvh bg-[#fafafa] md:flex">
      <AppSidebar role={role} name={name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[#e5e5e5] bg-white px-4 py-6 md:px-10">
          <div className="mx-auto w-full max-w-[1120px]">
            <h1 className="text-[26px] leading-[1.15] font-medium tracking-tight text-[#121212] lg:text-[32px]">
              {title}
            </h1>
            <p className="mt-1 text-[13px] text-[#737373]">Signed in as {name}</p>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 py-6 pb-28 md:px-10 md:py-8 md:pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}
