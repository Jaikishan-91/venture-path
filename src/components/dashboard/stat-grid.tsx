/**
 * One bordered strip of numbers with hairline dividers: two per row on phones, four from `md`.
 * The inner grid is pulled 1px under the frame so cell borders never double the outer border.
 * Named so tests and screen readers can find it.
 */
export function StatGrid({
  label = "Summary",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
    >
      <div className="-mr-px -mb-px grid grid-cols-2 md:grid-cols-4">{children}</div>
    </div>
  );
}
