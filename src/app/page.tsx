import { ArrowRight, BadgeCheck, Briefcase, Building2, Mic, Search, Trophy } from "lucide-react";
import Link from "next/link";
import { PublicFrame } from "@/components/public-frame";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/authz";

const QUICK_LINKS = [
  { href: "/opportunities", label: "Internships", icon: Briefcase },
  { href: "/opportunities", label: "Freelance work", icon: Search },
  { href: "/challenges", label: "Paid challenges", icon: Trophy },
];

const STEPS = [
  {
    icon: Trophy,
    title: "Solve a real challenge",
    body: "Pick a problem posted by a local business and send your solution before the deadline.",
  },
  {
    icon: BadgeCheck,
    title: "Earn verified proof",
    body: "Winning work becomes a green Proof card on your profile, so businesses see what you can do.",
  },
  {
    icon: Briefcase,
    title: "Apply and get hired",
    body: "Attach your proof to applications, take a short AI interview, and hear back fast.",
  },
];

const FEATURES = [
  {
    icon: BadgeCheck,
    title: "Proof over resumes",
    body: "Show real work instead of a list of claims. Verified proof stands out to every reviewer.",
  },
  {
    icon: Mic,
    title: "AI interviews, any time",
    body: "A short voice interview you can take when it suits you, with a fair, structured report.",
  },
  {
    icon: Building2,
    title: "Reviewed businesses",
    body: "Every organisation is approved by our team before its listings go live.",
  },
];

/** Decorative product preview beside the hero copy: a proof card and an application update. */
function HeroPreview() {
  return (
    <div aria-hidden="true" className="relative hidden h-[420px] lg:block">
      <div className="absolute top-0 right-0 w-[340px] rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f9ef] px-2.5 py-1 text-[12px] font-medium text-[#00994f]">
            <BadgeCheck className="size-3.5" /> Verified proof
          </span>
          <span className="text-[12px] text-[#a3a3a3]">Challenge winner</span>
        </div>
        <p className="mt-4 text-[16px] font-medium text-[#121212]">
          Redesigned checkout for a local bakery
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#737373]">
          Cut drop-offs by simplifying the order form to one page.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {["Figma", "UX research", "React"].map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-[#e5e5e5] px-2.5 py-1 text-[12px] text-[#121212]"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute bottom-6 left-0 w-[300px] rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-pop">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-[#00bf63] text-white">
            <Briefcase className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-[#121212]">UI Design Intern</p>
            <p className="text-[12px] text-[#737373]">Application update</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f5f5f5] px-3 py-2.5">
          <span className="text-[13px] text-[#737373]">Status</span>
          <span className="rounded-full bg-[#e6f9ef] px-2.5 py-0.5 text-[12px] font-medium text-[#00994f]">
            Shortlisted
          </span>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  const session = await getSession();

  return (
    <PublicFrame
      hero={
        <section className="relative overflow-hidden border-b border-[#e5e5e5]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_80%_0%,#e6f9ef_0%,transparent_70%)]"
          />
          <div className="relative mx-auto grid w-full max-w-[1280px] items-center gap-12 px-4 pt-14 pb-16 md:px-8 md:pt-24 md:pb-24 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col items-start gap-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-3 py-1 text-[12px] font-medium text-[#737373]">
                <span className="size-1.5 rounded-full bg-[#00bf63]" aria-hidden="true" />
                Internships · Freelance · Challenges
              </span>
              <h1 className="max-w-3xl text-[40px] leading-[1.08] font-semibold tracking-tight text-[#121212] md:text-[64px]">
                Prove your skills.
                <br />
                <span className="text-[#00bf63]">Get hired faster.</span>
              </h1>
              <p className="max-w-xl text-[16px] leading-relaxed text-[#737373] md:text-[18px]">
                Solve real problems from growing businesses, build verified proof of your work, and
                land internships and freelance gigs.
              </p>
              <div className="flex flex-wrap gap-3">
                {session ? (
                  <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
                    Go to dashboard <ArrowRight data-icon="inline-end" />
                  </Link>
                ) : (
                  <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                    Get started free <ArrowRight data-icon="inline-end" />
                  </Link>
                )}
                <Link
                  href="/opportunities"
                  className={buttonVariants({ size: "lg", variant: "outline" })}
                >
                  Explore jobs
                </Link>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={label}
                    href={href}
                    className="inline-flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-4 py-2 text-[13px] font-medium text-[#121212] transition-colors duration-200 hover:border-[#00bf63] hover:text-[#00994f]"
                  >
                    <Icon className="size-4 text-[#00bf63]" aria-hidden="true" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <HeroPreview />
          </div>
        </section>
      }
    >
      <section className="flex flex-col gap-8 px-4 py-16 md:px-8 md:py-20">
        <div className="flex flex-col gap-2">
          <h2 className="text-[26px] leading-[1.15] font-medium text-[#121212] lg:text-[36px]">
            How it works?
          </h2>
          <p className="text-[14px] text-[#737373]">
            Three steps from your first challenge to your first offer.
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className="flex flex-col gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#e6f9ef] text-[#00994f]">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-[13px] font-medium text-[#a3a3a3]">Step {i + 1}</span>
              </div>
              <h3 className="text-[18px] font-medium text-[#121212]">{title}</h3>
              <p className="text-[14px] leading-relaxed text-[#737373]">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-8 px-4 pb-16 md:px-8 md:pb-20">
        <h2 className="text-[26px] leading-[1.15] font-medium text-[#121212] lg:text-[36px]">
          Why Venture Path
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-3 rounded-2xl bg-[#f5f5f5] p-6">
              <Icon className="size-6 text-[#00bf63]" aria-hidden="true" />
              <h3 className="text-[18px] font-medium text-[#121212]">{title}</h3>
              <p className="text-[14px] leading-relaxed text-[#737373]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20 md:px-8">
        <div className="flex flex-col items-start gap-6 rounded-[24px] bg-[#121212] p-8 md:flex-row md:items-center md:justify-between md:p-12">
          <div className="flex max-w-xl flex-col gap-2">
            <h2 className="text-[26px] leading-[1.15] font-medium text-white lg:text-[32px]">
              Hiring for your business?
            </h2>
            <p className="text-[14px] leading-relaxed text-white/70">
              Post a challenge or a job in one form. Review proof, run AI interviews, and hire the
              right person.
            </p>
          </div>
          <Link href="/organisation/sign-up" className={buttonVariants({ size: "lg" })}>
            Post work for free <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
      </section>
    </PublicFrame>
  );
}
