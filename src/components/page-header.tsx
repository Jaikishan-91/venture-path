import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** Title row for a signed-in page: optional back link, title, one-line description, actions. */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-col gap-3">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-[#737373] transition-colors hover:text-[#121212]"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-[#121212] md:text-[28px]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-[14px] leading-relaxed text-[#737373]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
