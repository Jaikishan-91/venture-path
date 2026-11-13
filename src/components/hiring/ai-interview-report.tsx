import type { ReactNode } from "react";
import type { OrgInterviewView } from "@/lib/ai-interview";
import {
  INTERVIEW_RECOMMENDATION_LABELS,
  interviewScore,
  type InterviewRecommendation,
  type InterviewReport,
  type TranscriptTurn,
} from "@/lib/v2/types";

/**
 * AI interview report panel (docs/PRODUCT.md Module 6). Organisation owner only: hiring managers
 * and students never see it. Advice only; `actions` carries the page's own decision forms.
 * Reports written before per-question scores (no `report.questions`) still render.
 */

export const RECOMMENDATION_STYLE: Record<
  InterviewRecommendation,
  { dot: string; className: string }
> = {
  strong: { dot: "🟢", className: "bg-[#e6f9ef] text-[#00994f]" },
  maybe: { dot: "🟡", className: "bg-[#fbf3dc] text-[#6b5310]" },
  not_fit: { dot: "🔴", className: "bg-[#f8ece9] text-[#7f3326]" },
};

const STATUS_TEXT: Record<OrgInterviewView["status"], string> = {
  invited: "Invite sent — waiting for the candidate to start.",
  in_progress: "The candidate is taking the interview now.",
  completed: "Finished.",
  expired: "Not finished — the link expired or the candidate left this step.",
};

const MODE_LABEL = { chat: "💬 Chat", voice: "🎤 Voice" } as const;

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function durationText(start: Date | null | undefined, end: Date | null): string | null {
  if (!start || !end) return null;
  const minutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

/** A 0–5 score as five small bars plus the number. */
export function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={`h-2 w-3 rounded-sm ${step <= score ? "bg-[#00bf63]" : "bg-[#e5e5e5]"}`}
          />
        ))}
      </span>
      <span className="text-xs text-[#737373]">{score}/5</span>
    </span>
  );
}

/** 🟢 Strong fit · 🟡 Maybe · 🔴 Not a fit — always advice only. */
export function RecommendationChip({
  recommendation,
  adviceNote = true,
}: {
  recommendation: InterviewRecommendation;
  adviceNote?: boolean;
}) {
  const style = RECOMMENDATION_STYLE[recommendation];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style.className}`}
    >
      <span aria-hidden="true">{style.dot}</span> {INTERVIEW_RECOMMENDATION_LABELS[recommendation]}
      {adviceNote && <span className="font-normal">(advice only)</span>}
    </span>
  );
}

function Transcript({ interview }: { interview: OrgInterviewView }) {
  return (
    <ol className="flex flex-col gap-2">
      {interview.transcript.map((turn, index) => (
        <li
          key={index}
          className={
            turn.role === "ai"
              ? "rounded-lg bg-[#f5f5f5] p-2 break-words"
              : "ml-4 rounded-lg border border-border p-2 break-words whitespace-pre-line"
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

function Answer({ turn }: { turn: TranscriptTurn | undefined }) {
  if (!turn) return <p className="text-muted-foreground">No answer.</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="break-words whitespace-pre-line">{turn.text}</p>
      {turn.pasted && (
        <span className="w-fit rounded-full bg-[#fbf3dc] px-2 py-0.5 text-xs text-[#6b5310]">
          🚩 Pasted
        </span>
      )}
    </div>
  );
}

/** One card per asked question: question → answer → follow-up → score and reason. */
function QuestionCards({
  interview,
  scores,
}: {
  interview: OrgInterviewView;
  scores: InterviewReport["questions"];
}) {
  const cards = interview.questions
    .map((question, index) => {
      const turns = interview.transcript.filter((turn) => turn.questionId === question.id);
      const answers = turns.filter((turn) => turn.role === "student");
      return {
        question,
        index,
        asked: turns.length > 0,
        answer: answers.find((turn) => !turn.followUp),
        followUpQuestion: turns.find((turn) => turn.role === "ai" && turn.followUp),
        followUpAnswer: answers.find((turn) => turn.followUp),
        score: scores?.find((entry) => entry.questionId === question.id),
      };
    })
    .filter((card) => card.asked);
  if (cards.length === 0) return null;

  return (
    <section aria-label="Answers by question" className="flex flex-col gap-2">
      <h4 className="font-medium">Answers by question</h4>
      <ol className="flex flex-col gap-2">
        {cards.map((card) => (
          <li
            key={card.question.id}
            aria-label={`Question ${card.index + 1}`}
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
              <p className="min-w-0 flex-1 font-medium break-words">
                <span className="text-muted-foreground">Q{card.index + 1}.</span>{" "}
                {card.question.text}
              </p>
              {card.score && <ScoreDots score={card.score.score} />}
            </div>
            <Answer turn={card.answer} />
            {card.followUpQuestion && (
              <div className="ml-2 flex min-w-0 flex-col gap-1 border-l-2 border-[#e5e5e5] pl-3">
                <p className="text-xs font-medium break-words text-muted-foreground">
                  Follow-up: {card.followUpQuestion.text}
                </p>
                <Answer turn={card.followUpAnswer} />
              </div>
            )}
            {card.score?.reason && (
              <p className="text-xs break-words text-[#737373]">
                <span className="font-medium">Why:</span> {card.score.reason}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AiInterviewReport({
  interview,
  actions,
  retry,
  aiAvailable = true,
}: {
  interview: OrgInterviewView;
  /** False when no LLM is configured: say "AI unavailable" rather than offering a retry. */
  aiAvailable?: boolean;
  /** Decision forms, shown under the report. */
  actions?: ReactNode;
  /** "Retry report" form, shown when the report failed (or got stuck). */
  retry?: ReactNode;
}) {
  const { report, recommendation } = interview;
  const done = interview.status === "completed" && interview.reportStatus === "done";
  const score = done ? interviewScore(report) : null;
  const stuck = interview.reportStatus === "pending" && interview.reportStale === true;
  const canRetry =
    interview.status === "completed" && (interview.reportStatus === "failed" || stuck);
  const duration =
    interview.status === "completed"
      ? durationText(interview.startedAt, interview.completedAt)
      : null;
  const flags = [
    interview.pasteCount > 0 &&
      `Pasted ${interview.pasteCount} answer${interview.pasteCount === 1 ? "" : "s"}`,
    interview.tabLeaveCount > 0 && `Left the tab ${interview.tabLeaveCount}×`,
  ].filter((flag): flag is string => Boolean(flag));
  // Avoid "AI interview · AI interview".
  const showStage = interview.stageName.trim().toLowerCase() !== "ai interview";

  const pendingText = stuck
    ? "The report seems stuck. Retry it, or read the answers below."
    : (interview.reportAttempts ?? 0) > 1
      ? "Writing the report… the AI was busy, so it is trying again. Refresh in a minute."
      : "Writing the report… refresh in a minute.";

  return (
    <section
      aria-label="AI interview report"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 text-sm"
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">AI interview{showStage && ` · ${interview.stageName}`}</h3>
          {done && recommendation && <RecommendationChip recommendation={recommendation} />}
        </div>
        {(score !== null || interview.mode || interview.completedAt) && (
          <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-[#737373]">
            {score !== null && (
              <div className="flex items-baseline gap-1">
                <dt className="sr-only">Interview score</dt>
                <dd>
                  <span className="text-2xl font-semibold text-[#121212]">{score}</span>/100
                </dd>
              </div>
            )}
            {interview.mode && (
              <div>
                <dt className="sr-only">Mode</dt>
                <dd>{MODE_LABEL[interview.mode]}</dd>
              </div>
            )}
            {duration && (
              <div>
                <dt className="sr-only">Duration</dt>
                <dd>⏱ {duration}</dd>
              </div>
            )}
            {interview.completedAt && (
              <div>
                <dt className="sr-only">Completed</dt>
                <dd>Completed {formatDate(interview.completedAt)}</dd>
              </div>
            )}
          </dl>
        )}
      </header>

      {interview.status !== "completed" && (
        <p className="text-muted-foreground">{STATUS_TEXT[interview.status]}</p>
      )}

      {interview.status === "completed" && interview.reportStatus !== "done" && (
        <p className="text-muted-foreground">
          {interview.reportStatus !== "failed"
            ? pendingText
            : aiAvailable
              ? "The AI report couldn't be written. Read the answers below, or retry."
              : "AI unavailable, so there's no report. Read the answers below."}
        </p>
      )}

      {done && report && (
        <>
          {report.summary && <p className="break-words">{report.summary}</p>}

          {(report.strengths.length > 0 || report.concerns.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {report.strengths.length > 0 && (
                <div className="min-w-0 rounded-lg bg-[#f2fcf6] p-3">
                  <p className="font-medium">✅ Strengths</p>
                  <ul className="mt-1 list-disc pl-5 break-words">
                    {report.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {report.concerns.length > 0 && (
                <div className="min-w-0 rounded-lg bg-[#fdf8ec] p-3">
                  <p className="font-medium">⚠️ Check in the live interview</p>
                  <ul className="mt-1 list-disc pl-5 break-words">
                    {report.concerns.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <section aria-label="Skills" className="flex flex-col gap-1">
            <h4 className="font-medium">Skills</h4>
            <ul className="flex flex-col divide-y divide-border">
              {report.skills.map((entry) => (
                <li key={entry.skill} className="flex min-w-0 flex-col gap-1 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 font-medium break-words">{entry.skill}</span>
                    <ScoreDots score={entry.score} />
                  </div>
                  <span className="min-w-0 break-words text-[#737373]">
                    {entry.quote ? (
                      <q>{entry.quote}</q>
                    ) : (
                      <span className="text-muted-foreground">No evidence</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {interview.status === "completed" && (
        <QuestionCards interview={interview} scores={done ? report?.questions : undefined} />
      )}

      {flags.length > 0 && (
        <p className="break-words">
          <span className="font-medium">🚩 Flags:</span> {flags.join(" · ")}{" "}
          <span className="text-muted-foreground">(for context, not a reason to reject)</span>
        </p>
      )}

      {interview.transcript.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">View full chat</summary>
          <div className="mt-2">
            <Transcript interview={interview} />
          </div>
        </details>
      )}

      {(actions || (canRetry && retry)) && (
        <div className="flex flex-wrap gap-2">
          {canRetry && retry}
          {actions}
        </div>
      )}
    </section>
  );
}
