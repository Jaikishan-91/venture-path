import Link from "next/link";

/** The Venture Path mark: a green tile with a rising path, plus the wordmark. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex shrink-0 items-center gap-2 ${className}`}>
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-[9px] bg-[#00bf63] text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
          <path
            d="M4 18c4 0 5-4 8-7s4-5 8-5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="20" cy="6" r="2" fill="currentColor" />
          <circle cx="4" cy="18" r="2" fill="currentColor" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-[#121212]">
        Venture <span className="text-[#00bf63]">Path</span>
      </span>
    </Link>
  );
}
