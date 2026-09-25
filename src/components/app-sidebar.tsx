"use client";

import {
  Briefcase,
  FileStack,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import type { Role } from "@/lib/roles";

/** `short` replaces `label` in the phone tab bar, where five full labels don't fit at 320px. */
type NavItem = { href: string; label: string; short?: string; icon: LucideIcon };

/** One entry per link; add a link to a role's nav by adding a line here. */
const NAV: Record<Role, NavItem[]> = {
  user: [
    { href: "/user", label: "Dashboard", icon: LayoutDashboard },
    { href: "/opportunities", label: "Explore jobs", short: "Jobs", icon: Search },
    { href: "/user/applications", label: "Applications", short: "Applied", icon: FileText },
    { href: "/user/resumes", label: "Resumes", icon: FileStack },
    { href: "/user/profile", label: "Profile", icon: UserRound },
  ],
  organisation: [
    { href: "/organisation", label: "Dashboard", icon: LayoutDashboard },
    { href: "/organisation/opportunities", label: "Listings", icon: Briefcase },
    { href: "/organisation/profile", label: "Profile", icon: UserRound },
  ],
  admin: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/organisations", label: "Organisation reviews", icon: ShieldCheck },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ],
};

const ROLE_NAMES: Record<Role, string> = {
  user: "User",
  organisation: "Organisation",
  admin: "Admin",
};

/** The one nav item matching the path: the longest href that is the path or a parent of it. */
export function currentHref(items: { href: string }[], pathname: string): string | undefined {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function AppSidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const items = NAV[role];
  const current = currentHref(items, pathname);

  const links = items.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      aria-current={href === current ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors duration-300 ${
        href === current
          ? "bg-[#26594a] text-white"
          : "text-[#4a4d53] hover:bg-[#f0f1f3] hover:text-[#1b2a26]"
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  ));

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[#ecedef] bg-white md:flex">
        <Link href="/" className="px-5 pt-6 font-heading text-lg text-[#26594a]">
          VenturePath
        </Link>
        <p className="px-5 pb-4 text-[10px] uppercase tracking-[0.18em] text-[#6e7e78]">Careers</p>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 px-3">
          {links}
        </nav>
        <div className="flex flex-col gap-3 border-t border-[#ecedef] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e3efe8] text-sm font-medium text-[#26594a]"
            >
              {name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-[#1b2a26]">{name}</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#6e7e78]">
                {ROLE_NAMES[role]}
              </p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <div className="border-b border-[#ecedef] bg-white md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <Link href="/" className="font-heading text-lg text-[#26594a]">
            VenturePath
          </Link>
          <SignOutButton />
        </div>
        {/* A tab bar: every link fits at 320px, so nothing hides off-screen. */}
        <nav
          aria-label="Main"
          className="grid gap-1 px-2 py-2"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map(({ href, label, short, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={href === current ? "page" : undefined}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] leading-tight transition-colors duration-300 ${
                href === current
                  ? "bg-[#26594a] text-white"
                  : "text-[#4a4d53] hover:bg-[#f0f1f3] hover:text-[#1b2a26]"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="w-full truncate text-center">{short ?? label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
