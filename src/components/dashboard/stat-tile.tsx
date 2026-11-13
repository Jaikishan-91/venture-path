import Link from "next/link";

type Tone = "default" | "accent" | "warn";

const TONES: Record<Tone, string> = {
  default: "bg-white ring-[#e5e5e5] shadow-card",
  accent: "bg-[#00bf63] text-white ring-[#00bf63] shadow-[0_8px_24px_-12px_rgb(0_191_99/0.6)]",
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
  const muted = tone === "accent" ? "text-white/85" : "text-[#737373]";
  const body = (
    <>
      <p className={`text-[13px] font-medium ${muted}`}>{label}</p>
      <p
        className={`mt-2 text-[32px] leading-none font-semibold tracking-tight tabular-nums ${tone === "accent" ? "" : "text-[#121212]"}`}
      >
        {value}
      </p>
      {hint && <p className={`mt-1 text-xs ${muted}`}>{hint}</p>}
    </>
  );
  const className = `block min-w-0 rounded-2xl p-5 ring-1 ${TONES[tone]}`;

  return href ? (
    <Link
      href={href}
      className={`${className} transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.45)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
