"use client";

import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reanalyzeAction } from "./actions";

type Analysis = {
  id: string;
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
  /** Whether the user can trigger a re-analysis (only if an LLM is configured). */
  canReanalyze: boolean;
}

export function ResumeAnalysis({ applicationId, analysis, canReanalyze }: Props) {
  const [state, action, pending] = useActionState<ReanalyzeState, FormData>(reanalyzeAction, {
    status: "idle",
  });

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resume analysis</CardTitle>
          <CardDescription>No analysis available yet.</CardDescription>
        </CardHeader>
        {canReanalyze && (
          <CardContent>
            <form action={action}>
              <input type="hidden" name="applicationId" value={applicationId} />
              <Button type="submit" size="sm" disabled={pending} className="self-start">
                {pending ? "Analyzing…" : "Analyze now"}
              </Button>
            </form>
          </CardContent>
        )}
      </Card>
    );
  }

  const scoreColor = analysis.score >= 80 ? "text-green-600" :
    analysis.score >= 60 ? "text-amber-600" : "text-red-600";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Resume analysis{" "}
          <span className={`inline-block text-2xl font-bold ${scoreColor}`}>
            {analysis.score}/100
          </span>
        </CardTitle>
        <CardDescription>
          {analysis.model && `Model: ${analysis.model} · `}
          Analyzed {formatDate(analysis.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {analysis.summary && <p className="whitespace-pre-line">{analysis.summary}</p>}
        {analysis.matchedSkills.length > 0 && (
          <div>
            <span className="font-medium">Matched skills:</span>{" "}
            {analysis.matchedSkills.join(", ")}
          </div>
        )}
        {analysis.missingSkills.length > 0 && (
          <div>
            <span className="font-medium">Missing skills:</span>{" "}
            {analysis.missingSkills.join(", ")}
          </div>
        )}
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
        {state.status === "done" && (
          <p className="text-sm text-green-600">Analysis refreshed.</p>
        )}
        {canReanalyze && (
          <form action={action} className="self-start">
            <input type="hidden" name="applicationId" value={applicationId} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? "Re-analyzing…" : "Re-analyze"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

type ReanalyzeState = { status: "idle" } | { status: "done" } | { status: "error"; message: string };

const formatDate = (date: Date) =>
  date.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
