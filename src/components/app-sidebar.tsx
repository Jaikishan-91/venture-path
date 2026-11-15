"use client";

import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import type { Role } from "@/lib/roles";

/**
 * `short` replaces `label` in the phone tab bar, where six full labels don't fit at 320px.
 * `also` lists other sections that belong to this item (e.g. resumes live under My Proof).
 */
type NavItem = { href: string; label: string; short?: string; also?: string[]; icon: LucideIcon };

/** One entry per link; add a link to a role's nav by adding a line here. */
const NAV: Record<Role, NavItem[]> = {
  user: [
    { href: "/user", label: "Dashboard", short: "Home", icon: LayoutDashboard },
    { href: "/challenges", label: "Challenges", short: "Solve", icon: Trophy },
    { href: "/opportunities", label: "Explore jobs", short: "Jobs", icon: Search },
    // Resumes are optional now (docs/PRODUCT.md Module 4); the library is linked from My Proof.
    {
      href: "/user/proof",
      label: "My Proof",
      short: "Proof",
      also: ["/user/resumes"],
      icon: BadgeCheck,
    },
    { href: "/user/applications", label: "Applications", short: "Applied", icon: FileText },
    { href: "/user/profile", label: "Profile", icon: UserRound },
  ],
  organisation: [
    { href: "/organisation", label: "Dashboard", short: "Home", icon: LayoutDashboard },
    { href: "/organisation/challenges", label: "Challenges", icon: Trophy },
    { href: "/organisation/opportunities", label: "Jobs", icon: Briefcase },
    { href: "/organisation/team", label: "Team", icon: Users },
    { href: "/organisation/profile", label: "Profile", icon: UserRound },
  ],
  admin: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    {
      href: "/admin/organisations",
      label: "Organisation reviews",
      short: "Reviews",
      icon: ShieldCheck,
    },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ],
  hiring_manager: [
    { href: "/hiring-manager", label: "Dashboard", icon: LayoutDashboard },
    { href: "/hiring-manager/interviews", label: "Interviews", icon: CalendarClock },
  ],
};

const ROLE_NAMES: Record<Role, string> = {
  user: "User",
  organisation: "Organisation",
  admin: "Admin",
  hiring_manager: "Hiring manager",
};

/** The one nav item matching the path: the longest href that is the path or a parent of it. */
export function currentHref(
  items: { href: string; also?: string[] }[],
  pathname: string,
): string | undefined {
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  return items
    .flatMap((item) =>
      [item.href, ...(item.also ?? [])].filter(under).map((base) => ({ href: item.href, base })),
    )
    .sort((a, b) => b.base.length - a.base.length)[0]?.href;
}

export function AppSidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const items = NAV[role];
  const current = currentHref(items, pathname);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[#e5e5e5] bg-white md:flex">
        <BrandLogo className="px-5 pt-5 pb-5" />
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === current;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] font-medium transition-colors duration-200 ${
                  active
                    ? "bg-[#f5f5f5] text-[#121212] before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-0.5 before:rounded-full before:bg-[#16a34a]"
                    : "text-[#525252] hover:bg-[#fafafa] hover:text-[#121212]"
                }`}
              >
                <Icon
                  className={`size-4 ${active ? "text-[#16a34a]" : "text-[#a3a3a3]"}`}
                  aria-hidden="true"
                />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-[#e5e5e5] px-3 py-3">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[13px] font-semibold text-white"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[#121212]">{name}</p>
            <p className="text-[12px] text-[#737373]">{ROLE_NAMES[role]}</p>
          </div>
          <SignOutButton compact />
        </div>
      </aside>

      {/* Phones: a slim top bar plus a bottom tab bar within thumb reach. */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#e5e5e5] bg-white/90 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 backdrop-blur-md md:hidden">
        <BrandLogo />
        <SignOutButton compact />
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-[#e5e5e5] bg-white/95 px-1 pt-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.375rem)] backdrop-blur-md md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ href, label, short, icon: Icon }) => {
          const active = href === current;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] leading-tight font-medium transition-colors duration-200 ${
                active ? "text-[#15803d]" : "text-[#737373]"
              }`}
            >
              <span
                className={`flex h-7 w-12 max-w-full items-center justify-center rounded-full transition-colors duration-200 ${
                  active ? "bg-[#f0fdf4]" : ""
                }`}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="w-full truncate text-center">{short ?? label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
