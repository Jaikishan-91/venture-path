import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

type Tone = "default" | "accent" | "warn";

const DOTS: Record<Tone, string | null> = {
  default: null,
  accent: "bg-[#16a34a]",
  warn: "bg-[#d97706]",
};

/** One headline number inside a `StatGrid`. The whole cell is a link when `href` is set. */
export function StatTile({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: Tone;
}) {
  const dot = DOTS[tone];
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#737373]">
        {dot ? <span aria-hidden className={`size-1.5 rounded-full ${dot}`} /> : null}
        {label}
        {href ? (
          <ArrowUpRight
            aria-hidden
            className="ml-auto size-3.5 text-[#d4d4d4] transition-colors group-hover:text-[#121212]"
          />
        ) : null}
      </p>
      <p
        className={`mt-1.5 text-[26px] leading-none font-semibold tracking-tight tabular-nums ${
          tone === "accent"
            ? "text-[#15803d]"
            : tone === "warn"
              ? "text-[#b45309]"
              : "text-[#121212]"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-[#737373]">{hint}</p>}
    </>
  );
  const className = "group block min-w-0 border-r border-b border-[#e5e5e5] px-5 py-4";

  return href ? (
    <Link href={href} className={`${className} transition-colors duration-200 hover:bg-[#fafafa]`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
