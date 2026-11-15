import { ArrowRight, ArrowUpRight, Check, MapPin, Search, Trophy } from "lucide-react";
import Link from "next/link";
import { PublicFrame } from "@/components/public-frame";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/authz";
import { daysLeftLabel, formatReward } from "@/lib/challenge-schemas";
import { listOpenChallenges } from "@/lib/challenges";
import { getHomeStats } from "@/lib/home";
import { WORK_MODE_LABELS, formatPay } from "@/lib/opportunity-schemas";
import { searchOpportunities, type OpportunitySummary } from "@/lib/search";
import { parseBrowseParams } from "@/lib/search-params";

const POPULAR = ["Social media", "Logo design", "Content writing", "Video editing"];

const TYPES = [
  { value: "", label: "All" },
  { value: "internship", label: "Internships" },
  { value: "freelance", label: "Freelance" },
];

const STEPS = [
  { title: "Solve a challenge", body: "Send a solution to a real business problem." },
  { title: "Earn verified proof", body: "Winning work becomes a Proof card on your profile." },
  { title: "Apply and get hired", body: "Attach proof, take a short AI interview, hear back." },
];

const AUDIENCES = [
  {
    title: "For students",
    body: "Build a profile businesses trust, without a long resume.",
    points: [
      "Internships and paid freelance work",
      "Proof cards from real challenges",
      "AI interview you take when it suits you",
    ],
    cta: { href: "/sign-up", label: "Create free account", primary: true },
  },
  {
    title: "For businesses",
    body: "Find people who have already shown they can do the work.",
    points: [
      "Post a challenge or a job in one form",
      "See proof of skill before you shortlist",
      "Structured AI interview reports",
    ],
    cta: { href: "/organisation/sign-up", label: "Post work for free", primary: false },
  },
];

const formatDeadline = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

const postedAgo = (date: Date | null) => {
  if (!date) return null;
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  return days === 0 ? "Posted today" : days === 1 ? "Posted yesterday" : `Posted ${days} days ago`;
};

export default async function Home() {
  const [session, { results: jobs }, challenges] = await Promise.all([
    getSession(),
    searchOpportunities(parseBrowseParams({})),
    listOpenChallenges(),
  ]);
  const stats = await getHomeStats();

  return (
    <PublicFrame>
      {/* Hero */}
      <section className="flex flex-col items-center px-4 pt-14 pb-14 text-center md:px-8 md:pt-20 md:pb-16">
        {/* One sentence per line, so the break always falls at the full stop. */}
        <h1 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.035em] text-[#121212] sm:text-[44px] lg:text-[54px]">
          <span className="block text-balance">Prove your skills on real work.</span>
          <span className="block text-balance text-[#737373]">
            Get hired by growing businesses.
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-balance text-[#525252] md:text-[17px]">
          Internships, freelance gigs and paid challenges from verified small businesses across
          India.
        </p>

        <form
          action="/opportunities"
          method="get"
          className="mt-8 w-full max-w-2xl rounded-xl border border-[#e5e5e5] bg-white p-2 text-left shadow-[0_8px_30px_-12px_rgb(0_0_0/0.12)]"
        >
          <fieldset className="flex gap-1 px-1 pb-2">
            <legend className="sr-only">Type</legend>
            {TYPES.map((type) => (
              <label key={type.label} className="cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value={type.value}
                  defaultChecked={type.value === ""}
                  className="peer sr-only"
                />
                <span className="inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium text-[#737373] transition-colors peer-checked:bg-[#f5f5f5] peer-checked:text-[#121212] peer-focus-visible:ring-2 peer-focus-visible:ring-[#121212]/20 hover:text-[#121212]">
                  {type.label}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <label htmlFor="hero-q" className="sr-only">
              Search jobs
            </label>
            <div className="relative flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-[#a3a3a3]"
              />
              <input
                id="hero-q"
                name="q"
                type="search"
                maxLength={200}
                placeholder="Skill, role or business"
                className="h-12 w-full rounded-lg border border-[#e5e5e5] bg-[#fafafa] pr-3 pl-11 text-base outline-none placeholder:text-[#a3a3a3] focus-visible:border-[#121212] focus-visible:bg-white focus-visible:ring-3 focus-visible:ring-[#121212]/10"
              />
            </div>
            <button
              type="submit"
              className="h-12 cursor-pointer rounded-lg bg-[#16a34a] px-5 text-[15px] font-medium text-white transition-colors duration-200 hover:bg-[#15803d]"
            >
              Search
            </button>
          </div>
        </form>

        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-[#737373]">
          Popular:
          {POPULAR.map((term) => (
            <Link
              key={term}
              href={`/opportunities?q=${encodeURIComponent(term)}`}
              className="text-[#404040] underline decoration-[#d4d4d4] underline-offset-4 transition-colors hover:decoration-[#121212]"
            >
              {term}
            </Link>
          ))}
        </p>

        <dl className="mt-10 grid w-full max-w-2xl grid-cols-3 divide-x divide-[#e5e5e5] rounded-xl border border-[#e5e5e5] bg-[#fafafa]">
          {[
            { label: "Open jobs", value: stats.jobs },
            { label: "Open challenges", value: challenges.length },
            { label: "Verified businesses", value: stats.businesses },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-0.5 px-3 py-4">
              <dd className="text-[22px] font-semibold tracking-tight text-[#121212] tabular-nums md:text-[26px]">
                {stat.value}
              </dd>
              <dt className="text-[12px] text-[#737373] md:text-[13px]">{stat.label}</dt>
            </div>
          ))}
        </dl>

        {session ? (
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#15803d] hover:underline"
          >
            Go to your dashboard <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </section>

      {/* Latest jobs */}
      {jobs.length > 0 ? (
        <section className="flex flex-col gap-5 border-t border-[#e5e5e5] px-4 py-12 md:px-8">
          <SectionHeader title="Latest opportunities" href="/opportunities" link="View all jobs" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.slice(0, 6).map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Challenges + how it works */}
      <section className="grid gap-6 border-t border-[#e5e5e5] px-4 py-12 md:px-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionHeader title="Open challenges" href="/challenges" link="See all challenges" />
          {challenges.length > 0 ? (
            <ul className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
              {challenges.slice(0, 5).map((challenge) => (
                <li key={challenge.id} className="border-b border-[#e5e5e5] last:border-b-0">
                  <Link
                    href={`/challenges/${challenge.id}`}
                    className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[#fafafa]"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#525252]">
                      <Trophy aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-[#121212]">
                        {challenge.title}
                      </span>
                      <span className="block truncate text-[13px] text-[#737373]">
                        {challenge.organisationProfile.businessName} ·{" "}
                        {daysLeftLabel(challenge.deadline)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[14px] font-semibold text-[#15803d] tabular-nums">
                      {formatReward(challenge)}
                    </span>
                    <ArrowUpRight
                      aria-hidden
                      className="hidden size-4 shrink-0 text-[#a3a3a3] transition-colors group-hover:text-[#121212] sm:block"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-[#d4d4d4] px-4 py-8 text-center text-[14px] text-[#737373]">
              No open challenges right now. New ones are posted every week.
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-5 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
          <h2 className="text-[18px] font-semibold text-[#121212]">How it works</h2>
          <ol className="flex flex-col gap-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[12px] font-semibold text-white tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14px] font-medium text-[#121212]">{step.title}</p>
                  <p className="text-[13px] leading-relaxed text-[#737373]">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      {/* Audiences */}
      <section className="grid gap-4 border-t border-[#e5e5e5] px-4 py-12 md:grid-cols-2 md:px-8">
        {AUDIENCES.map((audience) => (
          <div
            key={audience.title}
            className="flex flex-col gap-5 rounded-xl border border-[#e5e5e5] bg-white p-6"
          >
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[20px] font-semibold text-[#121212]">{audience.title}</h2>
              <p className="text-[14px] text-[#737373]">{audience.body}</p>
            </div>
            <ul className="flex flex-col gap-2.5">
              {audience.points.map((point) => (
                <li key={point} className="flex gap-2.5 text-[14px] text-[#404040]">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[#16a34a]" />
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href={audience.cta.href}
              className={buttonVariants({
                variant: audience.cta.primary ? "default" : "outline",
                className: "mt-auto self-start",
              })}
            >
              {audience.cta.label}
            </Link>
          </div>
        ))}
      </section>
    </PublicFrame>
  );
}

function SectionHeader({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="text-[22px] font-semibold tracking-tight text-[#121212] md:text-[24px]">
        {title}
      </h2>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-[#525252] transition-colors hover:text-[#121212]"
      >
        {link} <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

function JobCard({ job }: { job: OpportunitySummary }) {
  const location = job.city
    ? `${WORK_MODE_LABELS[job.workMode]} · ${job.city}`
    : WORK_MODE_LABELS[job.workMode];
  return (
    <Link
      href={`/opportunities/${job.id}`}
      className="group flex h-full flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-5 transition-[border-color,box-shadow] duration-200 hover:border-[#a3a3a3] hover:shadow-[0_6px_20px_-12px_rgb(0_0_0/0.2)]"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[15px] font-semibold text-[#404040]"
        >
          {job.businessName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[#404040]">{job.businessName}</p>
          <p className="flex items-center gap-1 truncate text-[12px] text-[#737373]">
            <MapPin aria-hidden className="size-3 shrink-0" />
            {location}
          </p>
        </div>
      </div>
      <h3 className="text-[16px] leading-snug font-semibold text-[#121212] group-hover:underline group-hover:underline-offset-4">
        {job.title}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-[#f5f5f5] px-2 py-1 text-[12px] font-medium text-[#404040]">
          {job.type === "internship" ? "Internship" : "Freelance"}
        </span>
        <span className="rounded-md bg-[#f0fdf4] px-2 py-1 text-[12px] font-medium text-[#15803d]">
          {formatPay(job)}
        </span>
        {job.skills.slice(0, 2).map((skill) => (
          <span
            key={skill}
            className="rounded-md border border-[#e5e5e5] px-2 py-1 text-[12px] text-[#525252]"
          >
            {skill}
          </span>
        ))}
      </div>
      <p className="mt-auto flex justify-between gap-2 border-t border-[#f0f0f0] pt-3 text-[12px] text-[#737373]">
        <span>{postedAgo(job.publishedAt)}</span>
        {job.deadline ? <span>Apply by {formatDeadline(job.deadline)}</span> : null}
      </p>
    </Link>
  );
}
