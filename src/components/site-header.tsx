import Link from "next/link";
import { HeaderAuthLinks } from "@/components/auth-nav-links";
import { BrandLogo } from "@/components/brand-logo";
import { HeaderNavLink, HeaderShell } from "@/components/header-shell";
import { getSession } from "@/lib/authz";
import { homePathFor, isRole } from "@/lib/roles";

const NAV = [
  { href: "/opportunities", label: "Explore jobs" },
  { href: "/challenges", label: "Challenges" },
];

const linkClass =
  "rounded-md px-3 py-2 text-[14px] font-medium text-[#525252] transition-colors duration-200 hover:text-[#121212]";
const signInClass =
  "inline-flex h-9 items-center rounded-lg bg-[#121212] px-4 text-[14px] font-medium text-white transition-colors duration-200 hover:bg-[#262626]";

export async function SiteHeader() {
  const session = await getSession();
  const role = isRole(session?.user.role) ? session.user.role : null;

  return (
    <HeaderShell>
      <div className="flex h-16 items-center justify-between gap-4 px-4 transition-[height] duration-300 group-data-scrolled/header:h-14 md:px-6">
        <div className="flex items-center gap-6">
          <BrandLogo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <HeaderNavLink key={item.href} href={item.href}>
                {item.label}
              </HeaderNavLink>
            ))}
          </nav>
        </div>
        <nav className="flex items-center gap-1.5">
          {role ? (
            <Link href={homePathFor(role)} className={signInClass}>
              Dashboard
            </Link>
          ) : (
            <HeaderAuthLinks
              linkClass={`${linkClass} hidden sm:inline-flex`}
              signInClass={signInClass}
            />
          )}
        </nav>
      </div>
      {/* Phones: the main links stay one tap away instead of hiding in a menu. */}
      <nav
        aria-label="Main mobile"
        className="flex gap-1 overflow-x-auto border-t border-[#e5e5e5] px-3 py-2 group-data-scrolled/header:hidden md:hidden"
      >
        {NAV.map((item) => (
          <HeaderNavLink key={item.href} href={item.href} className="shrink-0">
            {item.label}
          </HeaderNavLink>
        ))}
        {!role && (
          <Link href="/organisation/sign-in" className={`${linkClass} shrink-0`}>
            For organisations
          </Link>
        )}
      </nav>
    </HeaderShell>
  );
}
