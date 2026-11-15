import { FileText, Link2 } from "lucide-react";
import type { ProofLevel, ProofSource } from "@/lib/v2/types";
import { ProofBadge } from "./proof-badge";

export type ProofCardData = {
  id: string;
  title: string;
  whatIDid: string;
  link: string | null;
  fileName: string | null;
  skills: string[];
  source: ProofSource;
  level: ProofLevel;
};

const COMPACT_CHARS = 280;

const SOURCE_LABELS: Record<ProofSource, string | null> = {
  manual: null,
  challenge: "From a challenge",
  apply_task: "Apply task answer",
};

/**
 * One proof card: badge, title, what the student did, skills, link and file. Used on My Proof,
 * the applicants page and submission views. `children` holds actions (edit, delete) in a footer.
 */
export function ProofCard({
  proof,
  compact = false,
  children,
}: {
  proof: ProofCardData;
  /** Shorten a long "What I did" (e.g. an apply task answer) behind "Show all". */
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const source = SOURCE_LABELS[proof.source];
  return (
    <div
      aria-label={proof.title}
      className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-white ${
        proof.level === "verified" ? "border-[#bbf7d0]" : "border-[#e5e5e5]"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ProofBadge level={proof.level} />
          {source && <span className="text-[12px] text-[#737373]">{source}</span>}
        </div>
        <p className="min-w-0 text-[15px] leading-snug font-semibold break-words text-[#121212]">
          {proof.title}
        </p>
        {compact && proof.whatIDid.length > COMPACT_CHARS ? (
          <details className="text-[14px] leading-relaxed text-[#525252]">
            <summary className="cursor-pointer break-words whitespace-pre-line">
              {proof.whatIDid.slice(0, COMPACT_CHARS).trimEnd()}…{" "}
              <span className="font-medium text-[#121212] underline">Show all</span>
            </summary>
            <p className="mt-2 break-words whitespace-pre-line">{proof.whatIDid}</p>
          </details>
        ) : (
          <p className="text-[14px] leading-relaxed break-words whitespace-pre-line text-[#525252]">
            {proof.whatIDid}
          </p>
        )}
        {proof.skills.length > 0 && (
          <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
            {proof.skills.map((skill) => (
              <li
                key={skill}
                className="rounded-md border border-[#e5e5e5] px-2 py-0.5 text-[12px] text-[#404040]"
              >
                {skill}
              </li>
            ))}
          </ul>
        )}
        {(proof.link || proof.fileName) && (
          <div className="mt-auto flex min-w-0 flex-col gap-1.5 pt-1 text-[13px]">
            {proof.link && (
              <a
                href={proof.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex min-w-0 items-center gap-1.5 font-medium text-[#15803d] hover:underline"
              >
                <Link2 aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{proof.link}</span>
              </a>
            )}
            {proof.fileName && (
              <a
                href={`/api/proofs/${proof.id}/file`}
                className="flex min-w-0 items-center gap-1.5 font-medium text-[#15803d] hover:underline"
              >
                <FileText aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">Download {proof.fileName}</span>
              </a>
            )}
          </div>
        )}
      </div>
      {children ? (
        <div className="flex min-w-0 flex-col gap-2 border-t border-[#f0f0f0] bg-[#fafafa] px-4 py-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
