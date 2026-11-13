import Link from "next/link";

/** A titled dashboard panel with an optional link in its header. */
export function DashboardSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-card md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-[18px] font-medium text-[#121212]">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="rounded-full px-2 py-1 text-[13px] font-medium text-[#00994f] transition-colors hover:bg-[#e6f9ef]"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-[#f5f5f5] px-4 py-6 text-center text-sm text-[#737373]">
      {children}
    </p>
  );
}
