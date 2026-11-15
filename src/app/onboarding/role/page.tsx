import { ArrowRight, Building2, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { requireSession } from "@/lib/authz";
import { homePathFor, isRole } from "@/lib/roles";
import { chooseRole } from "./actions";

export const metadata: Metadata = { title: "Choose your role · Venture Path" };

const OPTIONS = [
  {
    value: "user",
    label: "I'm a user",
    description: "Find internships and freelance work, solve challenges, build proof.",
    icon: GraduationCap,
  },
  {
    value: "organisation",
    label: "I'm an organisation (business)",
    description: "Post challenges and jobs, review proof, and hire.",
    icon: Building2,
  },
] as const;

export default async function ChooseRolePage() {
  const session = await requireSession();
  if (isRole(session.user.role)) redirect(homePathFor(session.user.role));

  return (
    <div className="flex min-h-dvh flex-col bg-[#fafafa] px-4 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:px-8">
      <header>
        <BrandLogo />
      </header>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="flex w-full max-w-lg flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-[#121212]">
              How will you use Venture Path?
            </h1>
            <p className="text-[14px] text-[#737373]">
              Pick one to set up your account. You can&apos;t change this later.
            </p>
          </div>
          {/* Each card is a submit button posting its `role`, as before. */}
          <form action={chooseRole} className="flex flex-col gap-3">
            {OPTIONS.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                type="submit"
                name="role"
                value={value}
                className="group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-[#e5e5e5] bg-white p-5 text-left transition-colors duration-200 hover:border-[#16a34a] hover:bg-[#f0fdf4]/40 focus-visible:border-[#16a34a] focus-visible:ring-3 focus-visible:ring-[#16a34a]/20 focus-visible:outline-none"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#404040] transition-colors group-hover:border-[#bbf7d0] group-hover:text-[#15803d]">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-[#121212]">{label}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-[#737373]">
                    {description}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-[#d4d4d4] transition-colors group-hover:text-[#15803d]"
                />
              </button>
            ))}
          </form>
          <p className="text-[13px] text-[#737373]">Signed in as {session.user.email}</p>
        </div>
      </main>
    </div>
  );
}
