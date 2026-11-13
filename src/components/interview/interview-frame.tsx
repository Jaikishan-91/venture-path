import { cn } from "cn";
import { BrandLogo } from "@/components/brand-logo";

/**
 * Full-height frame for the student's AI interview room (`/interview/[token]`): no site nav or
 * footer, only a small top bar (Venture Path · business · role). `wide` gives the two-panel live
 * room more space than the reading-width intro and messages.
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
    <div className="flex min-h-dvh w-full flex-1 flex-col bg-[#fafafa] bg-[radial-gradient(70%_50%_at_50%_0%,#eefaf3_0%,transparent_70%)]">
      <header className="sticky top-0 z-20 border-b border-[#e5e5e5] bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className={cn("mx-auto flex w-full items-center gap-3 px-4 py-3", width)}>
          <BrandLogo />
          {businessName ? (
            <>
              <span aria-hidden className="h-6 w-px shrink-0 bg-[#e5e5e5]" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium text-[#121212]">{businessName}</p>
                {listingTitle ? (
                  <p className="truncate text-xs text-[#737373]">{listingTitle}</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </header>
      <main className={cn("mx-auto flex w-full flex-1 flex-col px-4", width)}>{children}</main>
    </div>
  );
}
