import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecommendationChip, ScoreDots } from "@/components/hiring/ai-interview-report";
import { ProofBadge } from "@/components/proof/proof-badge";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import {
  getInterviewComparison,
  parseCompareIds,
  type CompareCandidate,
} from "@/lib/interview-compare";
import { MAX_COMPARE, MIN_COMPARE } from "@/lib/v2/types";

export const metadata: Metadata = { title: "Compare candidates · VenturePath" };

/** Column classes per candidate count (static so Tailwind sees them). */
const COLUMNS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 xl:grid-cols-4",
};

const INTERVIEW_STATUS: Record<NonNullable<CompareCandidate["interview"]>["status"], string> = {
  invited: "Invited, not started",
  in_progress: "Taking it now",
  completed: "Finished",
  expired: "Not finished",
};

function interviewText(interview: CompareCandidate["interview"]): string {
  if (!interview) return "No AI interview";
  if (interview.status !== "completed") return INTERVIEW_STATUS[interview.status];
  if (interview.reportStatus === "failed") return "Report couldn't be written";
  return "Report being written";
}

/**
 * Compare 2–4 candidates side by side (plan 2026-11-12-hiring-and-ai-interview-v2, Part 3.4).
 * The listing's owner only; anyone else gets a 404. Advice only: the owner still decides.
 */
export default async function CompareCandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("organisation");
  const { id } = await params;
  const ids = parseCompareIds((await searchParams).ids);
  const result = await getInterviewComparison(session.user.id, id, ids);
  if (!result.ok && result.reason === "not_found") notFound();
  const boardPath = `/organisation/opportunities/${id}/applicants`;

  if (!result.ok) {
    return (
      <RoleHome title="Compare candidates" name={session.user.name}>
        <p className="text-sm">
          Pick {MIN_COMPARE} to {MAX_COMPARE} candidates on the board to compare them.
        </p>
        <Link href={boardPath} className="text-sm underline">
          Back to applicants
        </Link>
      </RoleHome>
    );
  }

  const { view } = result;
  // Rows every column shares, so they line up side by side (CSS subgrid).
  const rowCount = 3 + view.skills.length + 3;

  return (
    <RoleHome title="Compare candidates" name={session.user.name}>
      <div className="flex flex-col gap-1">
        <Link href={boardPath} className="text-sm underline">
          Back to applicants
        </Link>
        <p className="text-sm text-[#4a4d53]">
          {view.opportunity.title} · {view.candidates.length} candidates. Scores are advice only;
          you decide.
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-x-3 ${COLUMNS[view.candidates.length]}`}>
        {view.candidates.map((candidate) => (
          <article
            key={candidate.applicationId}
            aria-label={candidate.name}
            className="mb-4 grid min-w-0 rounded-xl bg-white text-sm ring-1 ring-[#ecedef]"
            style={{ gridRow: `span ${rowCount}`, gridTemplateRows: "subgrid" }}
          >
            <div className="flex min-w-0 flex-col gap-1.5 border-b border-[#ecedef] p-3">
              <h2 className="text-base font-medium break-words text-[#1b2a26]">{candidate.name}</h2>
              {candidate.bestProof ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                  <ProofBadge level={candidate.bestProof.level} />
                  <span className="min-w-0 break-words text-[#4a4d53]">
                    {candidate.bestProof.title}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No proof cards</p>
              )}
            </div>

            <div className="flex items-baseline justify-between gap-2 border-b border-[#ecedef] px-3 py-2">
              <span className="text-xs text-[#4a4d53]">AI screening</span>
              <span className="font-medium">
                {candidate.screeningScore !== null ? `${candidate.screeningScore}/100` : "–"}
              </span>
            </div>

            <div className="flex flex-col gap-1 border-b border-[#ecedef] px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-[#4a4d53]">AI interview</span>
                {candidate.interview?.score != null ? (
                  <span>
                    <span className="text-xl font-semibold text-[#1b2a26]">
                      {candidate.interview.score}
                    </span>
                    /100
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {interviewText(candidate.interview)}
                  </span>
                )}
              </div>
              {candidate.interview?.recommendation && (
                <RecommendationChip
                  recommendation={candidate.interview.recommendation}
                  adviceNote={false}
                />
              )}
            </div>

            {view.skills.map((skill, index) => {
              const score = candidate.skillScores[index];
              return (
                <div
                  key={skill}
                  className="flex min-w-0 items-center justify-between gap-2 px-3 py-1.5"
                >
                  <span className="min-w-0 text-xs break-words text-[#4a4d53]">{skill}</span>
                  {score !== null ? (
                    <ScoreDots score={score} />
                  ) : (
                    <span aria-label="No score" className="text-muted-foreground">
                      –
                    </span>
                  )}
                </div>
              );
            })}

            <div className="min-w-0 border-t border-[#ecedef] px-3 py-2">
              <p className="text-xs font-medium">✅ Strengths</p>
              {candidate.strengths.length > 0 ? (
                <ul className="list-disc pl-5 break-words">
                  {candidate.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">–</p>
              )}
            </div>

            <div className="min-w-0 px-3 py-2">
              <p className="text-xs font-medium">⚠️ Check in the live interview</p>
              {candidate.concerns.length > 0 ? (
                <ul className="list-disc pl-5 break-words">
                  {candidate.concerns.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">–</p>
              )}
            </div>

            <div className="self-end p-3">
              <Link
                href={`${boardPath}/${candidate.applicationId}`}
                className="text-sm font-medium text-[#26594a] underline"
              >
                Open {candidate.name.split(" ")[0]}&apos;s page
              </Link>
            </div>
          </article>
        ))}
      </div>
    </RoleHome>
  );
}
