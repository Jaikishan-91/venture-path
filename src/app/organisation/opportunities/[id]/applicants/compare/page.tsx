import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
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

export const metadata: Metadata = { title: "Compare candidates · Venture Path" };

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
      <RoleHome
        title="Compare candidates"
        name={session.user.name}
        back={{ href: boardPath, label: "Back to applicants" }}
      >
        <p className="rounded-xl border border-dashed border-[#d4d4d4] px-4 py-10 text-center text-sm text-[#737373]">
          Pick {MIN_COMPARE} to {MAX_COMPARE} candidates on the board to compare them.
        </p>
      </RoleHome>
    );
  }

  const { view } = result;
  // Rows every column shares, so they line up side by side (CSS subgrid).
  const rowCount = 3 + view.skills.length + 3;

  return (
    <RoleHome
      title="Compare candidates"
      name={session.user.name}
      back={{ href: boardPath, label: "Back to applicants" }}
      description={`${view.opportunity.title} · ${view.candidates.length} candidates. Scores are advice only; you decide.`}
    >
      {/* Columns stay side by side so rows line up; narrow screens scroll sideways here only. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <div
          className="grid gap-x-3"
          style={{
            gridTemplateColumns: `repeat(${view.candidates.length}, minmax(220px, 1fr))`,
          }}
        >
          {view.candidates.map((candidate) => (
            <article
              key={candidate.applicationId}
              aria-label={candidate.name}
              className="grid min-w-0 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white text-sm"
              style={{ gridRow: `span ${rowCount}`, gridTemplateRows: "subgrid" }}
            >
              <div className="flex min-w-0 flex-col gap-2 border-b border-[#f0f0f0] p-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[13px] font-semibold text-white"
                  >
                    {candidate.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <h2 className="min-w-0 text-[15px] font-semibold break-words text-[#121212]">
                    {candidate.name}
                  </h2>
                </div>
                {candidate.bestProof ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                    <ProofBadge level={candidate.bestProof.level} />
                    <span className="min-w-0 break-words text-[#737373]">
                      {candidate.bestProof.title}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-[#a3a3a3]">No proof cards</p>
                )}
              </div>

              <div className="flex items-baseline justify-between gap-2 border-b border-[#f0f0f0] px-4 py-3">
                <span className="text-[12px] font-medium text-[#737373]">AI screening</span>
                <span className="text-[15px] font-semibold text-[#121212] tabular-nums">
                  {candidate.screeningScore !== null ? `${candidate.screeningScore}/100` : "–"}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 border-b border-[#f0f0f0] bg-[#fafafa] px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium text-[#737373]">AI interview</span>
                  {candidate.interview?.score != null ? (
                    <span className="text-[12px] text-[#737373]">
                      <span className="text-[24px] leading-none font-semibold tracking-tight text-[#121212] tabular-nums">
                        {candidate.interview.score}
                      </span>
                      /100
                    </span>
                  ) : (
                    <span className="text-xs text-[#a3a3a3]">
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
                    className="flex min-w-0 items-center justify-between gap-2 border-b border-[#f7f7f7] px-4 py-2"
                  >
                    <span className="min-w-0 text-[13px] break-words text-[#404040]">{skill}</span>
                    {score !== null ? (
                      <ScoreDots score={score} />
                    ) : (
                      <span aria-label="No score" className="text-[#a3a3a3]">
                        –
                      </span>
                    )}
                  </div>
                );
              })}

              <div className="min-w-0 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#15803d]">
                  <CheckCircle2 aria-hidden className="size-3.5" /> Strengths
                </p>
                {candidate.strengths.length > 0 ? (
                  <ul className="mt-1.5 list-disc pl-5 break-words text-[13px] text-[#404040] marker:text-[#d4d4d4]">
                    {candidate.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#a3a3a3]">–</p>
                )}
              </div>

              <div className="min-w-0 border-t border-[#f7f7f7] px-4 py-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#b45309]">
                  <AlertTriangle aria-hidden className="size-3.5" /> Check in the live interview
                </p>
                {candidate.concerns.length > 0 ? (
                  <ul className="mt-1.5 list-disc pl-5 break-words text-[13px] text-[#404040] marker:text-[#d4d4d4]">
                    {candidate.concerns.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#a3a3a3]">–</p>
                )}
              </div>

              <div className="self-end border-t border-[#f0f0f0] bg-[#fafafa] px-4 py-3">
                <Link
                  href={`${boardPath}/${candidate.applicationId}`}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[#121212] underline-offset-4 hover:underline"
                >
                  Open {candidate.name.split(" ")[0]}&apos;s page
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </RoleHome>
  );
}
