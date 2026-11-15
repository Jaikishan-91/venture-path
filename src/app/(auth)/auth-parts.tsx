import { Loader2 } from "lucide-react";

/** Shared pieces for the sign-in, sign-up and invite forms. */

export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-[#121212]">
        {title}
      </h1>
      <p className="text-[14px] leading-relaxed text-[#737373]">{description}</p>
    </div>
  );
}

/** Field wrapper: label above, optional hint below. */
export function AuthField({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {children}
      {hint ? <p className="text-[12px] text-[#737373]">{hint}</p> : null}
    </div>
  );
}

/** The last server error, next to the form (the toast says it too, but disappears). */
export function AuthError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] leading-relaxed text-[#991b1b]">
      {message}
    </p>
  );
}

export function Spinner() {
  return <Loader2 aria-hidden className="animate-spin" />;
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[12px] text-[#a3a3a3]" aria-hidden>
      <span className="h-px flex-1 bg-[#e5e5e5]" />
      or
      <span className="h-px flex-1 bg-[#e5e5e5]" />
    </div>
  );
}

/** Google "G" mark for the Continue with Google buttons. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}
