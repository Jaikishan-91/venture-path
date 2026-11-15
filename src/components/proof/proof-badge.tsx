import { BadgeCheck, CircleCheck, CircleDashed, type LucideIcon } from "lucide-react";
import { PROOF_LEVEL_LABELS, type ProofLevel } from "@/lib/v2/types";

const ICONS: Record<ProofLevel, LucideIcon> = {
  added: CircleDashed,
  checked: CircleCheck,
  verified: BadgeCheck,
};

/** What each badge means, in plain words ("Checked" is "plausible", never "verified"). */
export const PROOF_LEVEL_HINTS: Record<ProofLevel, string> = {
  added: "Added by the student.",
  checked: "Plausible: the link opens and the description fits the skills. Not verified.",
  verified: "Won or placed in a business challenge.",
};

const STYLES: Record<ProofLevel, string> = {
  added: "border-[#e5e5e5] bg-white text-[#525252]",
  checked: "border-[#dbe7f7] bg-[#f3f7fd] text-[#1d4f8f]",
  verified: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
};

/** Added · Checked · Verified by business (docs/PRODUCT.md Module 3). */
export function ProofBadge({ level }: { level: ProofLevel }) {
  const Icon = ICONS[level];
  return (
    <span
      title={PROOF_LEVEL_HINTS[level]}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] font-medium ${STYLES[level]}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {PROOF_LEVEL_LABELS[level]}
    </span>
  );
}
