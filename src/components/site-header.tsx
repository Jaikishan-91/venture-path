import Link from "next/link";
import { getSession } from "@/lib/authz";
import { homePathFor, isRole } from "@/lib/roles";

export async function SiteHeader({ tone = "plain" }: { tone?: "plain" | "hero" }) {
  const session = await getSession();
  const role = isRole(session?.user.role) ? session.user.role : null;
  const onHero = tone === "hero";
  const linkClass = onHero
    ? "text-[13px] text-[#f4eddd]/85 transition-colors duration-300 hover:text-[#f4eddd]"
    : "text-[13px] text-[#4a4d53] transition-colors duration-300 hover:text-[#1b2a26]";
  const signInClass = onHero
    ? "inline-flex items-center rounded-full border border-[#f4eddd]/35 px-4 py-2 text-xs text-[#f4eddd] transition-colors duration-300 hover:bg-[#f4eddd]/10"
    : "inline-flex items-center rounded-full border border-[#26594a] px-4 py-2 text-xs text-[#26594a] transition-colors duration-300 hover:bg-[#26594a] hover:text-[#f4eddd]";

  return (
    <header
      className={`flex flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-8 ${onHero ? "" : "border-b border-[#ecedef]"}`}
    >
      <Link href="/" className="flex items-center gap-3">
        <span
          className={`font-heading text-lg leading-none ${onHero ? "text-[#f4eddd]" : "text-[#26594a]"}`}
        >
          VenturePath
        </span>
        <span
          className={`border-l pl-2.5 text-[10px] uppercase tracking-[0.18em] ${onHero ? "border-[#f4eddd]/25 text-[#a8c4b0]" : "border-[#26594a]/25 text-[#4a4d53]"}`}
        >
          Careers
        </span>
      </Link>
      <nav className="flex items-center gap-4">
        <Link href="/opportunities" className={linkClass}>
          Opportunities
        </Link>
        {role ? (
          <Link href={homePathFor(role)} className={signInClass}>
            Dashboard
          </Link>
        ) : (
          <Link href="/sign-in" className={signInClass}>
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
