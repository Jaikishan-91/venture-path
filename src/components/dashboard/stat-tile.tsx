import Link from "next/link";

type Tone = "default" | "accent" | "warn";

const TONES: Record<Tone, string> = {
  default: "bg-white ring-[#ecedef]",
  accent: "bg-[#26594a] text-[#f4eddd] ring-[#26594a]",
  warn: "bg-[#fbf3e6] ring-[#e8cf9f]",
};

/** One headline number. The whole tile is a link when `href` is set. */
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
  const muted = tone === "accent" ? "text-[#f4eddd]/80" : "text-[#4a4d53]";
  const body = (
    <>
      <p className={`text-[11px] uppercase tracking-[0.14em] ${muted}`}>{label}</p>
      <p
        className={`mt-2 text-3xl font-medium tracking-tight tabular-nums ${tone === "accent" ? "" : "text-[#1b2a26]"}`}
      >
        {value}
      </p>
      {hint && <p className={`mt-1 text-xs ${muted}`}>{hint}</p>}
    </>
  );
  const className = `block min-w-0 rounded-2xl p-4 ring-1 ${TONES[tone]}`;

  return href ? (
    <Link
      href={href}
      className={`${className} transition-shadow duration-300 hover:shadow-[0_10px_24px_-18px_rgba(22,24,29,0.45)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
