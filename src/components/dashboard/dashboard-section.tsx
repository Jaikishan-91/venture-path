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
      className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-[#ecedef] md:p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl text-[#1b2a26]">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="text-xs text-[#26594a] underline-offset-4 hover:underline"
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
    <p className="rounded-xl bg-[#f7f7f9] px-4 py-6 text-center text-sm text-[#4a4d53]">
      {children}
    </p>
  );
}
