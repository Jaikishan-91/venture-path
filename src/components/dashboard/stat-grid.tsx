/** Two tiles per row on phones, four from `md`. Named so tests and screen readers can find it. */
export function StatGrid({
  label = "Summary",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {children}
    </div>
  );
}
