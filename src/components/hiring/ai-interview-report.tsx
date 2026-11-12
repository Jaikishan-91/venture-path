import type { ReactNode } from "react";
import type { OrgInterviewView } from "@/lib/ai-interview";
import { INTERVIEW_RECOMMENDATION_LABELS, type InterviewRecommendation } from "@/lib/v2/types";

/**
 * AI interview report panel (docs/PRODUCT.md Module 6). Organisation owner only: hiring managers
 * and students never see it. Advice only; `actions` carries the existing Move / Reject forms.
 */

const RECOMMENDATION_STYLE: Record<InterviewRecommendation, { dot: string; className: string }> = {
  strong: { dot: "🟢", className: "bg-[#e8f0ed] text-[#26594a]" },
  maybe: { dot: "🟡", className: "bg-[#fbf3dc] text-[#6b5310]" },
  not_fit: { dot: "🔴", className: "bg-[#f8ece9] text-[#7f3326]" },
};

const STATUS_TEXT: Record<OrgInterviewView["status"], string> = {
  invited: "Invite sent — waiting for the candidate to start.",
  in_progress: "The candidate is taking the interview now.",
  completed: "Finished.",
  expired: "Not finished — the link expired or the candidate left this step.",
};

function Transcript({ interview }: { interview: OrgInterviewView }) {
  if (interview.transcript.length === 0) {
    return <p className="text-muted-foreground">No answers yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {interview.transcript.map((turn, index) => (
        <li
          key={index}
          className={
            turn.role === "ai"
              ? "rounded-lg bg-[#f7f7f9] p-2"
              : "ml-4 rounded-lg border border-border p-2 whitespace-pre-line"
          }
        >
          <span className="text-xs font-medium text-muted-foreground">
            {turn.role === "ai" ? (turn.followUp ? "AI follow-up" : "AI") : "Candidate"}
            {turn.pasted && " · pasted"}
          </span>
          <p>{turn.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function AiInterviewReport({
  interview,
  actions,
  retry,
}: {
  interview: OrgInterviewView;
  /** Move / Reject forms, shown when the candidate is still at a stage. */
  actions?: ReactNode;
  /** "Retry report" form, shown when the report failed. */
  retry?: ReactNode;
}) {
  const { report, recommendation } = interview;
  const flags = [
    interview.pasteCount > 0 &&
      `Pasted ${interview.pasteCount} answer${interview.pasteCount === 1 ? "" : "s"}`,
    interview.tabLeaveCount > 0 && `Left the tab ${interview.tabLeaveCount}×`,
  ].filter((flag): flag is string => Boolean(flag));

  return (
    <section
      aria-label="AI interview report"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">AI interview · {interview.stageName}</h3>
        {interview.status === "completed" &&
          interview.reportStatus === "done" &&
          recommendation && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${RECOMMENDATION_STYLE[recommendation].className}`}
            >
              {RECOMMENDATION_STYLE[recommendation].dot}{" "}
              {INTERVIEW_RECOMMENDATION_LABELS[recommendation]}
              <span className="font-normal">(advice only)</span>
            </span>
          )}
      </div>

      {interview.status !== "completed" && (
        <p className="text-muted-foreground">{STATUS_TEXT[interview.status]}</p>
      )}

      {interview.status === "completed" && interview.reportStatus !== "done" && (
        <p className="text-muted-foreground">
          {interview.reportStatus === "failed"
            ? "The AI report couldn't be written. Read the chat below, or retry."
            : "Writing the report… refresh in a minute."}
        </p>
      )}

      {report && (
        <>
          {report.summary && <p>{report.summary}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Skill</th>
                  <th className="py-1 pr-3 font-medium">Score</th>
                  <th className="py-1 font-medium">Evidence (candidate&apos;s words)</th>
                </tr>
              </thead>
              <tbody>
                {report.skills.map((entry) => (
                  <tr key={entry.skill} className="border-t border-border align-top">
                    <td className="py-1.5 pr-3">{entry.skill}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{entry.score}/5</td>
                    <td className="py-1.5">
                      {entry.quote ? (
                        <q>{entry.quote}</q>
                      ) : (
                        <span className="text-muted-foreground">No evidence</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.strengths.length > 0 && (
            <div>
              <p className="font-medium">✅ Strengths</p>
              <ul className="list-disc pl-5">
                {report.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {report.concerns.length > 0 && (
            <div>
              <p className="font-medium">⚠️ Check in live interview</p>
              <ul className="list-disc pl-5">
                {report.concerns.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {flags.length > 0 && (
        <p>
          <span className="font-medium">🚩 Flags:</span> {flags.join(" · ")}{" "}
          <span className="text-muted-foreground">(for context, not a reason to reject)</span>
        </p>
      )}

      {interview.transcript.length > 0 && (
        <details open={interview.reportStatus === "failed"}>
          <summary className="cursor-pointer font-medium">View full chat</summary>
          <div className="mt-2">
            <Transcript interview={interview} />
          </div>
        </details>
      )}

      {(actions || (interview.reportStatus === "failed" && retry)) && (
        <div className="flex flex-wrap gap-2">
          {interview.reportStatus === "failed" && retry}
          {actions}
        </div>
      )}
    </section>
  );
}
