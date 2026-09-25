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
  accepted: { label: "Accepted", className: "bg-[#e3efe8] text-[#26594a]" },
  rejected: { label: "Not selected", className: "bg-[#f7e6e2] text-[#a24b3a]" },
  withdrawn: { label: "Withdrawn", className: "bg-[#f0f1f3] text-[#4a4d53]" },
  draft: { label: "Draft", className: "bg-[#f0f1f3] text-[#4a4d53]" },
  published: { label: "Published", className: "bg-[#e3efe8] text-[#26594a]" },
  closed: { label: "Closed", className: "bg-[#f0f1f3] text-[#4a4d53]" },
  pending: { label: "Pending", className: "bg-[#fbf3e6] text-[#7a5212]" },
  approved: { label: "Approved", className: "bg-[#e3efe8] text-[#26594a]" },
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
