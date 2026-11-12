import { cn } from "cn";

/**
 * Full-height frame for the student's AI interview room (`/interview/[token]`): no site nav or
 * footer, only a small top bar (VenturePath · business · role) and an optional progress bar.
 */
export function InterviewFrame({
  businessName,
  listingTitle,
  progress,
  children,
}: {
  businessName?: string;
  listingTitle?: string;
  progress?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col bg-[#f7f7f9]">
      <header className="sticky top-0 z-20 border-b border-[#ecedef] bg-[#f7f7f9]/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-[#f7f7f9]/85">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <span className="font-heading text-base leading-none text-[#26594a]">VenturePath</span>
          {businessName ? (
            <>
              <span aria-hidden className="h-6 w-px shrink-0 bg-[#26594a]/20" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium text-[#1b2a26]">{businessName}</p>
                {listingTitle ? (
                  <p className="truncate text-xs text-[#4a4d53]">{listingTitle}</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        {progress}
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4">{children}</main>
    </div>
  );
}

/** "Question n of N" with one segment per question. */
export function InterviewProgress({
  current,
  total,
  label,
}: {
  /** 1-based question number being answered. */
  current: number;
  total: number;
  /** Text after "Question n of N", e.g. "follow-up". */
  label?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-3">
      <div
        role="progressbar"
        aria-label="Interview progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`Question ${current} of ${total}`}
        className="flex gap-1"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors motion-reduce:transition-none",
              index < current - 1
                ? "bg-[#26594a]"
                : index === current - 1
                  ? "bg-[#26594a]/55"
                  : "bg-[#26594a]/12",
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-[#4a4d53]">
        Question {current} of {total}
        {label ? <span className="text-[#4a4d53]/80"> · {label}</span> : null}
      </p>
    </div>
  );
}
