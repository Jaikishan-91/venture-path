/** Horizontal bars scaled to the largest value; each value is also shown as text. */
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-2">
            <span className="text-[#4a4d53]">{item.label}</span>
            <span className="font-medium tabular-nums text-[#1b2a26]">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#f0f1f3]" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[#26594a]"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
