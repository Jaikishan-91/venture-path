"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { reanalyzeAction, type ReanalyzeState } from "./actions";

type Analysis = {
  resumeScore: number | null;
  answersScore: number | null;
  overallScore: number | null;
  summary: string | null;
  answersSummary: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  model: string | null;
  createdAt: Date;
};

type Answer = {
  id: string;
  answer: string;
  score: number | null;
  feedback: string | null;
  question: { prompt: string };
};

interface Props {
  applicationId: string;
  analysis: Analysis | null;
  answers: Answer[];
  /** Whether the organisation can run the analysis (only when an LLM is configured). */
  canReanalyze: boolean;
  /** No resume attached: the "resume" score was computed from proof cards (ADR-043). */
  proofOnly?: boolean;
  /** False when the page lists the screening answers in their own section. */
  showAnswers?: boolean;
}

const scoreColor = (score: number | null) =>
  score === null
    ? "text-[#a3a3a3]"
    : score >= 80
      ? "text-[#15803d]"
      : score >= 60
        ? "text-[#b45309]"
        : "text-[#b91c1c]";

const barColor = (score: number) =>
  score >= 80 ? "bg-[#16a34a]" : score >= 60 ? "bg-[#d97706]" : "bg-[#dc2626]";

/** Missing data is shown as "-" (CONSTRAINTS: no fake data). */
const show = (score: number | null) => (score === null ? "-" : String(score));

function Score({ label, score, large }: { label: string; score: number | null; large?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-4 py-3">
      <dt className="text-[12px] font-medium text-[#737373]">{label}</dt>
      <dd
        className={`leading-none font-semibold tracking-tight tabular-nums ${large ? "text-[26px]" : "text-[20px]"} ${scoreColor(score)}`}
      >
        {show(score)}
        {score !== null && <span className="text-xs font-normal text-[#737373]">/100</span>}
      </dd>
      <span aria-hidden className="h-1 overflow-hidden rounded-full bg-[#f0f0f0]">
        {score !== null && (
          <span
            className={`block h-full rounded-full ${barColor(score)}`}
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        )}
      </span>
    </div>
  );
}

function SkillList({
  label,
  skills,
  tone,
}: {
  label: string;
  skills: string[];
  tone: "match" | "miss";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-[12px] font-semibold tracking-wide text-[#737373] uppercase">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <li
            key={skill}
            className={`rounded-md border px-2 py-0.5 text-[12px] ${
              tone === "match"
                ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
                : "border-dashed border-[#d4d4d4] text-[#737373]"
            }`}
          >
            {skill}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResumeAnalysis({
  applicationId,
  analysis,
  answers,
  canReanalyze,
  proofOnly = false,
  showAnswers = true,
}: Props) {
  const [state, action, pending] = useActionState<ReanalyzeState, FormData>(reanalyzeAction, {
    status: "idle",
  });
  useActionErrorToast(state);

  return (
    <section
      aria-label="AI screening"
      className="min-w-0 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0f0] px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#121212]">AI screening</h2>
          <p className="text-[13px] text-[#737373]">
            {analysis
              ? `Advice only · Analyzed ${formatDate(analysis.createdAt)}`
              : canReanalyze
                ? "No analysis yet."
                : "AI unavailable."}
          </p>
        </div>
        {canReanalyze && (
          <form action={action}>
            <input type="hidden" name="applicationId" value={applicationId} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze now"}
            </Button>
          </form>
        )}
      </div>
      <div className="flex flex-col gap-4 p-5 text-sm">
        <dl
          className="grid grid-cols-3 divide-x divide-[#f0f0f0] rounded-lg border border-[#e5e5e5]"
          aria-label="Scores"
        >
          <Score label="Overall" score={analysis?.overallScore ?? null} large />
          <Score label={proofOnly ? "Proof" : "Resume"} score={analysis?.resumeScore ?? null} />
          <Score
            label="Answers"
            score={answers.length === 0 ? null : (analysis?.answersScore ?? null)}
          />
        </dl>
        {analysis?.summary && (
          <p className="leading-relaxed whitespace-pre-line text-[#262626]">{analysis.summary}</p>
        )}
        {analysis && (analysis.matchedSkills.length > 0 || analysis.missingSkills.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {analysis.matchedSkills.length > 0 && (
              <SkillList label="Matched skills" skills={analysis.matchedSkills} tone="match" />
            )}
            {analysis.missingSkills.length > 0 && (
              <SkillList label="Missing skills" skills={analysis.missingSkills} tone="miss" />
            )}
          </div>
        )}
        {showAnswers && answers.length > 0 && (
          <details className="rounded-lg border border-[#e5e5e5] p-3">
            <summary className="cursor-pointer font-medium text-[#404040]">
              Answers ({answers.length})
            </summary>
            {analysis?.answersSummary && (
              <p className="mt-2 whitespace-pre-line text-[#737373]">{analysis.answersSummary}</p>
            )}
            <ol className="mt-2 flex flex-col gap-3">
              {answers.map((answer, index) => (
                <li key={answer.id} className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium break-words">
                    {index + 1}. {answer.question.prompt}
                  </p>
                  <p className="whitespace-pre-line break-words">{answer.answer}</p>
                  <p className="text-xs text-[#737373]">
                    Score{" "}
                    <span className={`font-semibold tabular-nums ${scoreColor(answer.score)}`}>
                      {show(answer.score)}
                    </span>
                    {answer.feedback && ` · ${answer.feedback}`}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </section>
  );
}

const formatDate = (date: Date) =>
  date.toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
