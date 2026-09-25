import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ecedef] px-6 py-5 text-sm text-[#4a4d53] md:px-8">
      <p>Freelance work and internships from MSMEs, for students.</p>
      <nav className="flex gap-4">
        <Link href="/opportunities" className="hover:text-[#1b2a26]">
          Opportunities
        </Link>
        <Link href="/sign-up" className="hover:text-[#1b2a26]">
          Sign up
        </Link>
      </nav>
    </footer>
  );
}
