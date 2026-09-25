import Link from "next/link";
import { FooterAuthLinks } from "@/components/auth-nav-links";

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ecedef] px-6 py-5 text-sm text-[#4a4d53] md:px-8">
      <p>Freelance work and internships from organisations, for users.</p>
      <nav className="flex gap-4">
        <Link href="/opportunities" className="hover:text-[#1b2a26]">
          Opportunities
        </Link>
        <FooterAuthLinks className="hover:text-[#1b2a26]" />
      </nav>
    </footer>
  );
}
