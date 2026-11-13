type Status =
  | "submitted"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "draft"
  | "published"
  | "closed"
  | "pending"
  | "approved";

const STYLES: Record<Status, { label: string; className: string }> = {
  submitted: { label: "Under review", className: "bg-[#fbf3e6] text-[#7a5212]" },
  accepted: { label: "Accepted", className: "bg-[#e6f9ef] text-[#00994f]" },
  rejected: { label: "Not selected", className: "bg-[#f7e6e2] text-[#a24b3a]" },
  withdrawn: { label: "Withdrawn", className: "bg-[#f5f5f5] text-[#737373]" },
  draft: { label: "Draft", className: "bg-[#f5f5f5] text-[#737373]" },
  published: { label: "Published", className: "bg-[#e6f9ef] text-[#00994f]" },
  closed: { label: "Closed", className: "bg-[#f5f5f5] text-[#737373]" },
  pending: { label: "Pending", className: "bg-[#fbf3e6] text-[#7a5212]" },
  approved: { label: "Approved", className: "bg-[#e6f9ef] text-[#00994f]" },
};

/** Status label with a colour; the text carries the meaning. */
export function StatusPill({ status }: { status: Status }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style.className}`}
    >
      {style.label}
    </span>
  );
}
