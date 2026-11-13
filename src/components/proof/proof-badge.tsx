import { PROOF_LEVEL_LABELS, type ProofLevel } from "@/lib/v2/types";

const ICONS: Record<ProofLevel, string> = { added: "⚪", checked: "🔵", verified: "🟢" };

/** What each badge means, in plain words (🔵 is "plausible", never "verified"). */
export const PROOF_LEVEL_HINTS: Record<ProofLevel, string> = {
  added: "Added by the student.",
  checked: "Plausible: the link opens and the description fits the skills. Not verified.",
  verified: "Won or placed in a business challenge.",
};

const STYLES: Record<ProofLevel, string> = {
  added: "bg-[#f5f5f5] text-[#737373]",
  checked: "bg-[#e8f0fb] text-[#1d4f8f]",
  verified: "bg-[#e6f9ef] text-[#00803f]",
};

/** ⚪ Added · 🔵 Checked · 🟢 Verified by business (docs/PRODUCT.md Module 3). */
export function ProofBadge({ level }: { level: ProofLevel }) {
  return (
    <span
      title={PROOF_LEVEL_HINTS[level]}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[level]}`}
    >
      <span aria-hidden="true">{ICONS[level]}</span>
      {PROOF_LEVEL_LABELS[level]}
    </span>
  );
}
