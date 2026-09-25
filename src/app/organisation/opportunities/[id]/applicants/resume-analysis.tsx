"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
}

const scoreColor = (score: number | null) =>
  score === null
    ? "text-[#4a4d53]"
    : score >= 80
      ? "text-green-700"
      : score >= 60
        ? "text-amber-700"
        : "text-red-700";

/** Missing data is shown as "-" (CONSTRAINTS: no fake data). */
const show = (score: number | null) => (score === null ? "-" : String(score));

function Score({ label, score, large }: { label: string; score: number | null; large?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[#4a4d53]">{label}</dt>
      <dd
        className={`tabular-nums font-semibold ${large ? "text-2xl" : "text-lg"} ${scoreColor(score)}`}
      >
        {show(score)}
        {score !== null && <span className="text-xs font-normal text-[#4a4d53]">/100</span>}
      </dd>
    </div>
  );
}

export function ResumeAnalysis({ applicationId, analysis, answers, canReanalyze }: Props) {
  const [state, action, pending] = useActionState<ReanalyzeState, FormData>(reanalyzeAction, {
    status: "idle",
  });
  useActionErrorToast(state);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI screening</CardTitle>
        <CardDescription>
          {analysis
            ? `${analysis.model ? `Model: ${analysis.model} · ` : ""}Analyzed ${formatDate(analysis.createdAt)}`
            : canReanalyze
              ? "No analysis yet."
              : "AI screening is not configured."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <dl className="grid grid-cols-3 gap-3" aria-label="Scores">
          <Score label="Overall" score={analysis?.overallScore ?? null} large />
          <Score label="Resume" score={analysis?.resumeScore ?? null} />
          <Score
            label="Answers"
            score={answers.length === 0 ? null : (analysis?.answersScore ?? null)}
          />
        </dl>
        {analysis?.summary && <p className="whitespace-pre-line">{analysis.summary}</p>}
        {analysis && analysis.matchedSkills.length > 0 && (
          <p>
            <span className="font-medium">Matched skills:</span> {analysis.matchedSkills.join(", ")}
          </p>
        )}
        {analysis && analysis.missingSkills.length > 0 && (
          <p>
            <span className="font-medium">Missing skills:</span> {analysis.missingSkills.join(", ")}
          </p>
        )}
        {answers.length > 0 && (
          <details className="rounded-lg bg-[#f7f7f9] p-3">
            <summary className="cursor-pointer font-medium">Answers ({answers.length})</summary>
            {analysis?.answersSummary && (
              <p className="mt-2 whitespace-pre-line text-[#4a4d53]">{analysis.answersSummary}</p>
            )}
            <ol className="mt-2 flex flex-col gap-3">
              {answers.map((answer, index) => (
                <li key={answer.id} className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium break-words">
                    {index + 1}. {answer.question.prompt}
                  </p>
                  <p className="whitespace-pre-line break-words">{answer.answer}</p>
                  <p className="text-xs text-[#4a4d53]">
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
        {canReanalyze && (
          <form action={action} className="self-start">
            <input type="hidden" name="applicationId" value={applicationId} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze now"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

const formatDate = (date: Date) =>
  date.toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
