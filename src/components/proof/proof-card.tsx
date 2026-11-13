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
 * One proof card: title, badge, what the student did, skills, link and file. Used on My Proof,
 * the applicants page and (after merge) submission views. `children` holds actions (edit, delete).
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
      className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-3 border border-[#e5e5e5] shadow-card"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 font-medium break-words text-[#121212]">{proof.title}</p>
        <ProofBadge level={proof.level} />
      </div>
      {source && <p className="text-xs text-[#737373]">{source}</p>}
      {compact && proof.whatIDid.length > COMPACT_CHARS ? (
        <details className="text-sm">
          <summary className="cursor-pointer break-words whitespace-pre-line">
            {proof.whatIDid.slice(0, COMPACT_CHARS).trimEnd()}…{" "}
            <span className="underline">Show all</span>
          </summary>
          <p className="mt-2 break-words whitespace-pre-line">{proof.whatIDid}</p>
        </details>
      ) : (
        <p className="text-sm break-words whitespace-pre-line">{proof.whatIDid}</p>
      )}
      {proof.skills.length > 0 && (
        <ul aria-label="Skills" className="flex flex-wrap gap-1.5 text-xs">
          {proof.skills.map((skill) => (
            <li key={skill} className="rounded-md bg-muted px-2 py-0.5">
              {skill}
            </li>
          ))}
        </ul>
      )}
      {(proof.link || proof.fileName) && (
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          {proof.link && (
            <a
              href={proof.link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="truncate text-[#00994f] underline"
            >
              {proof.link}
            </a>
          )}
          {proof.fileName && (
            <a href={`/api/proofs/${proof.id}/file`} className="truncate text-[#00994f] underline">
              Download {proof.fileName}
            </a>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
