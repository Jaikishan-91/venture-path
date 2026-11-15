import { BadgeCheck, Briefcase, Check } from "lucide-react";
import Link from "next/link";
import { FooterAuthLinks } from "@/components/auth-nav-links";
import { BrandLogo } from "@/components/brand-logo";

const FACTS = [
  "Proof over resumes: show work you've actually done",
  "A short AI interview you take when it suits you",
  "Every business is reviewed before it can post",
];

/**
 * Sign-in and sign-up pages: a focused form column on the left and, from `lg`, a quiet product
 * panel on the right. No site header or footer, so nothing competes with the form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-2">
      <div className="flex min-w-0 flex-col px-4 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <BrandLogo />
          <Link
            href="/opportunities"
            className="text-[14px] font-medium text-[#525252] transition-colors hover:text-[#121212]"
          >
            Explore jobs
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-[#737373]">
          <span>© {new Date().getFullYear()} Venture Path</span>
          <nav aria-label="Other areas" className="flex flex-wrap gap-x-4 gap-y-1">
            <FooterAuthLinks className="transition-colors hover:text-[#121212]" />
          </nav>
        </footer>
      </div>

      <aside
        aria-hidden
        className="hidden flex-col justify-center gap-10 border-l border-[#e5e5e5] bg-[#fafafa] px-12 py-16 lg:flex xl:px-20"
      >
        <div className="flex max-w-md flex-col gap-3">
          <p className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-[#121212]">
            Prove your skills on real work.
          </p>
          <p className="text-[15px] leading-relaxed text-[#525252]">
            Students solve real problems for small businesses and get hired for what they can do.
          </p>
        </div>

        {/* A plain sketch of the product: a verified proof card and an application update. */}
        <div className="flex max-w-md flex-col gap-3">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f0fdf4] px-2 py-1 text-[12px] font-medium text-[#15803d]">
                <BadgeCheck className="size-3.5" /> Verified proof
              </span>
              <span className="text-[12px] text-[#a3a3a3]">Challenge winner</span>
            </div>
            <p className="mt-3 text-[15px] font-semibold text-[#121212]">
              Festival posts for a sweet shop
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#737373]">
              Planned two weeks of posts; walk-ins with the offer code doubled.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Canva", "Content writing", "Instagram"].map((skill) => (
                <span
                  key={skill}
                  className="rounded-md border border-[#e5e5e5] px-2 py-0.5 text-[12px] text-[#404040]"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3">
            <span className="flex size-9 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#525252]">
              <Briefcase className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-[#121212]">Social media intern</p>
              <p className="text-[12px] text-[#737373]">Application update</p>
            </div>
            <span className="rounded-md bg-[#f0fdf4] px-2 py-0.5 text-[12px] font-medium text-[#15803d]">
              Shortlisted
            </span>
          </div>
        </div>

        <ul className="flex max-w-md flex-col gap-2.5">
          {FACTS.map((fact) => (
            <li key={fact} className="flex gap-2.5 text-[14px] text-[#404040]">
              <Check className="mt-0.5 size-4 shrink-0 text-[#16a34a]" />
              {fact}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
