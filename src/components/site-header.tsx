import Link from "next/link";
import { HeaderAuthLinks } from "@/components/auth-nav-links";
import { BrandLogo } from "@/components/brand-logo";
import { getSession } from "@/lib/authz";
import { homePathFor, isRole } from "@/lib/roles";

const NAV = [
  { href: "/opportunities", label: "Explore jobs" },
  { href: "/challenges", label: "Challenges" },
];

const linkClass =
  "rounded-full px-3 py-2 text-[14px] font-medium text-[#737373] transition-colors duration-200 hover:bg-[#f5f5f5] hover:text-[#121212]";
const signInClass =
  "inline-flex h-10 items-center rounded-full bg-[#00bf63] px-5 text-[14px] font-medium text-white transition-colors duration-200 hover:bg-[#00994f]";

export async function SiteHeader() {
  const session = await getSession();
  const role = isRole(session?.user.role) ? session.user.role : null;

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-[#e5e5e5] bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-4 px-4 md:px-8">
        <div className="flex items-center gap-6">
          <BrandLogo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
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
        className="flex gap-1 overflow-x-auto border-t border-[#e5e5e5] px-3 py-2 md:hidden"
      >
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`${linkClass} shrink-0`}>
            {item.label}
          </Link>
        ))}
        {!role && (
          <Link href="/organisation/sign-in" className={`${linkClass} shrink-0`}>
            For organisations
          </Link>
        )}
      </nav>
    </header>
  );
}
