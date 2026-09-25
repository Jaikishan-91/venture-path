import Link from "next/link";
import { PublicFrame } from "@/components/public-frame";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/authz";

const PATHS = [
  {
    href: "/opportunities",
    title: "Find an open role",
    body: "Browse internships and freelance work from approved businesses. Apply when a listing fits.",
  },
  {
    href: "/student/applications",
    title: "Follow your application",
    body: "Sign in as a student to see which listings you have applied to and what the business decided.",
  },
  {
    href: "/sign-up",
    title: "Post work as a business",
    body: "MSMEs create a profile, get approved, and publish internships or paid freelance listings.",
  },
];

const NOTES = [
  {
    title: "Internships with a real brief",
    body: "Listings name the work, the skills, the city or remote setup, and when applications close.",
  },
  {
    title: "Freelance tasks that pay",
    body: "Short pieces of work from small businesses, with a pay range shown before you apply.",
  },
  {
    title: "Businesses reviewed first",
    body: "An admin approves an MSME before students can see its published listings.",
  },
];

export default async function Home() {
  const session = await getSession();

  return (
    <PublicFrame
      hero={
        <>
          <SiteHeader tone="hero" />
          <div className="flex flex-col gap-6 px-6 pt-4 pb-12 md:px-10 md:pb-16">
            <h1 className="text-4xl font-medium tracking-tight text-[#f4eddd] md:text-5xl">
              VenturePath
            </h1>
            <p className="max-w-xl text-lg leading-snug text-[#f4eddd] md:text-2xl">
              Find freelance work and internships from growing businesses.
            </p>
            <p className="max-w-md text-sm leading-relaxed text-[#f4eddd]/75">
              Students apply to MSME listings. Businesses post the work and review who applied.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/opportunities"
                className={buttonVariants({
                  variant: "outline",
                  className:
                    "border-[#f4eddd]/40 bg-transparent text-[#f4eddd] hover:bg-[#f4eddd]/10 hover:text-[#f4eddd]",
                })}
              >
                Browse opportunities
              </Link>
              {session ? (
                <Link
                  href="/dashboard"
                  className={buttonVariants({ className: "bg-[#f4eddd] text-[#1f4138] hover:bg-[#f4eddd]/90" })}
                >
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/sign-up"
                    className={buttonVariants({
                      className: "bg-[#f4eddd] text-[#1f4138] hover:bg-[#f4eddd]/90",
                    })}
                  >
                    Sign up
                  </Link>
                  <Link
                    href="/sign-in"
                    className={buttonVariants({
                      variant: "outline",
                      className:
                        "border-[#f4eddd]/40 bg-transparent text-[#f4eddd] hover:bg-[#f4eddd]/10 hover:text-[#f4eddd]",
                    })}
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      }
    >
      <section className="grid gap-4 px-6 py-10 md:grid-cols-3 md:px-8">
        {PATHS.map((path) => (
          <Link
            key={path.href}
            href={path.href}
            className="flex flex-col gap-2 rounded-2xl bg-white p-5 ring-1 ring-[#e2e5e7] transition-colors duration-300 hover:ring-[#26594a]"
          >
            <h2 className="text-xl font-medium text-[#26594a]">{path.title}</h2>
            <p className="text-sm leading-relaxed text-[#4a4d53]">{path.body}</p>
          </Link>
        ))}
      </section>
      <section className="grid gap-8 border-t border-[#ecedef] px-6 py-10 md:grid-cols-3 md:px-8">
        {NOTES.map((note) => (
          <div key={note.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-medium text-[#1b2a26]">{note.title}</h2>
            <p className="text-sm leading-relaxed text-[#4a4d53]">{note.body}</p>
          </div>
        ))}
      </section>
    </PublicFrame>
  );
}
