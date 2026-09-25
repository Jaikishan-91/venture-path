"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import type { Role } from "@/lib/roles";

const NAV: Record<Role, { href: string; label: string }[]> = {
  student: [
    { href: "/student", label: "Dashboard" },
    { href: "/opportunities", label: "Opportunities" },
    { href: "/student/applications", label: "Applications" },
    { href: "/student/profile", label: "Profile" },
  ],
  msme: [
    { href: "/msme", label: "Dashboard" },
    { href: "/msme/opportunities", label: "Listings" },
    { href: "/msme/profile", label: "Profile" },
  ],
  admin: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/msmes", label: "MSME reviews" },
    { href: "/admin/settings", label: "Settings" },
  ],
};

function isCurrent(pathname: string, href: string) {
  if (href === "/student" || href === "/msme" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV[role];

  function links(compact: boolean) {
    return items.map((item) => {
      const current = isCurrent(pathname, item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={current ? "page" : undefined}
          className={
            current
              ? "shrink-0 rounded-lg bg-[#26594a] px-3 py-2 text-sm whitespace-nowrap text-white"
              : `shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-[#4a4d53] transition-colors duration-300 hover:bg-[#f0f1f3] hover:text-[#1b2a26] ${compact ? "" : ""}`
          }
        >
          {item.label}
        </Link>
      );
    });
  }

  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[#ecedef] bg-white md:flex">
        <Link href="/" className="px-5 pt-6 font-heading text-lg text-[#26594a]">
          VenturePath
        </Link>
        <p className="px-5 pb-4 text-[10px] uppercase tracking-[0.18em] text-[#6e7e78]">Careers</p>
        <nav className="flex flex-1 flex-col gap-1 px-3">{links(false)}</nav>
        <div className="p-4">
          <SignOutButton />
        </div>
      </aside>
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#ecedef] bg-white px-4 py-3 md:hidden">
        <nav className="flex flex-1 gap-1">{links(true)}</nav>
        <SignOutButton />
      </div>
    </>
  );
}
