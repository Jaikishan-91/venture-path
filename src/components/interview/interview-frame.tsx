import { cn } from "cn";
import { X } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

/**
 * Full-height frame for the student's AI interview room (`/interview/[token]`): no site nav or
 * footer, only a small top bar (Venture Path · business · role · Exit). `wide` gives the lobby and
 * the two-panel live room more space than the reading-width messages.
 */
export function InterviewFrame({
  businessName,
  listingTitle,
  wide,
  children,
}: {
  businessName?: string;
  listingTitle?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const width = wide ? "max-w-6xl" : "max-w-2xl";
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col bg-[#fafafa]">
      <header className="sticky top-0 z-20 border-b border-[#e5e5e5] bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className={cn("mx-auto flex h-14 w-full items-center gap-3 px-4", width)}>
          <BrandLogo />
          {businessName ? (
            <>
              <span aria-hidden className="h-6 w-px shrink-0 bg-[#e5e5e5]" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-medium text-[#121212]">{businessName}</p>
                {listingTitle ? (
                  <p className="truncate text-[12px] text-[#737373]">{listingTitle}</p>
                ) : null}
              </div>
            </>
          ) : null}
          {/* Leaving is safe: answers are saved and unsent drafts are kept on this device. */}
          <Link
            href="/user/applications"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-[#737373] transition-colors hover:bg-[#f5f5f5] hover:text-[#121212]"
          >
            <X aria-hidden className="size-4" />
            Exit
          </Link>
        </div>
      </header>
      <main className={cn("mx-auto flex w-full flex-1 flex-col px-4", width)}>{children}</main>
    </div>
  );
}

const TONES = {
  neutral: "bg-[#f5f5f5] text-[#525252]",
  success: "bg-[#f0fdf4] text-[#15803d]",
  warn: "bg-[#fffbeb] text-[#b45309]",
} as const;

/** A calm, centred message card for the room's end and error states. */
export function RoomMessage({
  icon,
  tone = "neutral",
  title,
  headingRef,
  children,
  action,
}: {
  icon: React.ReactNode;
  tone?: keyof typeof TONES;
  title: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="my-auto py-10">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-[#e5e5e5] bg-white px-6 py-8 text-center">
        <span
          aria-hidden
          className={cn(
            "flex size-12 items-center justify-center rounded-full [&_svg]:size-6",
            TONES[tone],
          )}
        >
          {icon}
        </span>
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-[#121212] outline-none"
        >
          {title}
        </h1>
        <div className="flex flex-col gap-2 text-[14px] leading-relaxed text-[#525252]">
          {children}
        </div>
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </section>
  );
}
