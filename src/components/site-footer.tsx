import Link from "next/link";
import { FooterAuthLinks } from "@/components/auth-nav-links";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[#e5e5e5] bg-[#f5f5f5]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between md:px-8">
        <div className="flex max-w-xs flex-col gap-3">
          <BrandLogo />
          <p className="text-[13px] leading-relaxed text-[#737373]">
            Prove your skills on real work. Get hired by growing businesses.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[#737373]">
          <Link href="/opportunities" className="hover:text-[#121212]">
            Explore jobs
          </Link>
          <Link href="/challenges" className="hover:text-[#121212]">
            Challenges
          </Link>
          <FooterAuthLinks className="hover:text-[#121212]" />
        </nav>
      </div>
      <p className="mx-auto w-full max-w-[1280px] px-4 pb-8 text-[12px] text-[#a3a3a3] md:px-8">
        © {new Date().getFullYear()} Venture Path
      </p>
    </footer>
  );
}
