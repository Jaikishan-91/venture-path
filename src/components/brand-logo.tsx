import Link from "next/link";

/** The Venture Path mark: a green tile with a rising path, plus the wordmark. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex shrink-0 items-center gap-2 ${className}`}>
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-md bg-[#16a34a] text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-4">
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
      <span className="font-[family-name:var(--font-poppins)] text-[17px] font-semibold tracking-tight text-[#121212]">
        Venture Path
      </span>
    </Link>
  );
}
