"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reanalyzeAction, type ReanalyzeState } from "./actions";

type Analysis = {
  score: number;
  summary: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  model: string | null;
  createdAt: Date;
};

interface Props {
  applicationId: string;
  analysis: Analysis | null;
  /** Whether the organisation can run the analysis (only when an LLM is configured). */
  canReanalyze: boolean;
}

export function ResumeAnalysis({ applicationId, analysis, canReanalyze }: Props) {
  const [state, action, pending] = useActionState<ReanalyzeState, FormData>(reanalyzeAction, {
    status: "idle",
  });
  useActionErrorToast(state);

  const scoreColor = !analysis
    ? ""
    : analysis.score >= 80
      ? "text-green-700"
      : analysis.score >= 60
        ? "text-amber-700"
        : "text-red-700";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Resume analysis
          {analysis && (
            <span className={`ml-2 inline-block text-2xl font-bold ${scoreColor}`}>
              {analysis.score}/100
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {analysis
            ? `${analysis.model ? `Model: ${analysis.model} · ` : ""}Analyzed ${formatDate(analysis.createdAt)}`
            : canReanalyze
              ? "No analysis yet."
              : "Resume analysis is not configured."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
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
