import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** A titled panel: header row with a hairline under it, then the content. */
export function DashboardSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0f0] px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
          {description ? <p className="text-[13px] text-[#737373]">{description}</p> : null}
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#525252] transition-colors hover:text-[#121212]"
          >
            {action.label}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[#d4d4d4] px-4 py-6 text-center text-sm text-[#737373]">
      {children}
    </p>
  );
}
