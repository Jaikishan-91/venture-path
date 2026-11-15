import { AlertTriangle, CheckCircle2, Clock, Flag, MessageSquare, Mic } from "lucide-react";
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
  strong: { dot: "bg-[#16a34a]", className: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" },
  maybe: { dot: "bg-[#d97706]", className: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]" },
  not_fit: { dot: "bg-[#dc2626]", className: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]" },
};

const STATUS_TEXT: Record<OrgInterviewView["status"], string> = {
  invited: "Invite sent — waiting for the candidate to start.",
  in_progress: "The candidate is taking the interview now.",
  completed: "Finished.",
  expired: "Not finished — the link expired or the candidate left this step.",
};

const MODE = {
  chat: { label: "Chat", icon: MessageSquare },
  voice: { label: "Voice", icon: Mic },
} as const;

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
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={`h-1.5 w-3.5 rounded-full ${
              step <= score
                ? score >= 4
                  ? "bg-[#16a34a]"
                  : score >= 3
                    ? "bg-[#65a30d]"
                    : "bg-[#d97706]"
                : "bg-[#ececec]"
            }`}
          />
        ))}
      </span>
      <span className="text-[12px] font-medium text-[#525252] tabular-nums">{score}/5</span>
    </span>
  );
}

/** Strong fit · Maybe · Not a fit — always advice only. */
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
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${style.className}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {INTERVIEW_RECOMMENDATION_LABELS[recommendation]}
      {adviceNote && <span className="font-normal opacity-80">(advice only)</span>}
    </span>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-[12px] font-semibold tracking-wide text-[#737373] uppercase">{children}</h4>
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
              ? "mr-6 rounded-lg bg-[#fafafa] px-3 py-2 break-words"
              : "ml-6 rounded-lg border border-[#e5e5e5] px-3 py-2 break-words whitespace-pre-line"
          }
        >
          <span className="text-[11px] font-medium text-[#737373]">
            {turn.role === "ai" ? (turn.followUp ? "AI follow-up" : "AI") : "Candidate"}
            {turn.pasted && " · pasted"}
          </span>
          <p className="text-[#262626]">{turn.text}</p>
        </li>
      ))}
    </ol>
  );
}

function Answer({ turn }: { turn: TranscriptTurn | undefined }) {
  if (!turn) return <p className="text-[#a3a3a3]">No answer.</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="break-words whitespace-pre-line text-[#262626]">{turn.text}</p>
      {turn.pasted && (
        <span className="inline-flex w-fit items-center gap-1 rounded-md border border-[#fde68a] bg-[#fffbeb] px-1.5 py-0.5 text-[11px] font-medium text-[#92400e]">
          <Flag aria-hidden className="size-3" /> Pasted
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
      <SubHeading>Answers by question</SubHeading>
      <ol className="flex flex-col divide-y divide-[#f0f0f0] rounded-lg border border-[#e5e5e5]">
        {cards.map((card) => (
          <li
            key={card.question.id}
            aria-label={`Question ${card.index + 1}`}
            className="flex min-w-0 flex-col gap-2 p-3"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <p className="min-w-0 flex-1 font-medium break-words text-[#121212]">
                <span className="text-[#a3a3a3] tabular-nums">Q{card.index + 1}</span>{" "}
                {card.question.text}
              </p>
              {card.score && <ScoreDots score={card.score.score} />}
            </div>
            <Answer turn={card.answer} />
            {card.followUpQuestion && (
              <div className="flex min-w-0 flex-col gap-1 border-l-2 border-[#e5e5e5] pl-3">
                <p className="text-[12px] font-medium break-words text-[#737373]">
                  Follow-up: {card.followUpQuestion.text}
                </p>
                <Answer turn={card.followUpAnswer} />
              </div>
            )}
            {card.score?.reason && (
              <p className="text-[12px] break-words text-[#737373]">
                <span className="font-medium text-[#525252]">Why:</span> {card.score.reason}
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
  const mode = interview.mode ? MODE[interview.mode] : null;

  const pendingText = stuck
    ? "The report seems stuck. Retry it, or read the answers below."
    : (interview.reportAttempts ?? 0) > 1
      ? "Writing the report… the AI was busy, so it is trying again. Refresh in a minute."
      : "Writing the report… refresh in a minute.";

  return (
    <section
      aria-label="AI interview report"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e5e5e5] bg-white text-[14px]"
    >
      <header className="flex flex-col gap-3 border-b border-[#f0f0f0] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#121212]">
            AI interview{showStage && ` · ${interview.stageName}`}
          </h3>
          {done && recommendation && <RecommendationChip recommendation={recommendation} />}
        </div>
        {(score !== null || interview.mode || interview.completedAt) && (
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[#737373]">
            {score !== null && (
              <div className="flex items-baseline gap-1">
                <dt className="sr-only">Interview score</dt>
                <dd>
                  <span className="text-[28px] leading-none font-semibold tracking-tight text-[#121212] tabular-nums">
                    {score}
                  </span>
                  <span className="ml-0.5">/100</span>
                </dd>
              </div>
            )}
            {mode && (
              <div>
                <dt className="sr-only">Mode</dt>
                <dd className="inline-flex items-center gap-1">
                  <mode.icon aria-hidden className="size-3.5" />
                  {mode.label}
                </dd>
              </div>
            )}
            {duration && (
              <div>
                <dt className="sr-only">Duration</dt>
                <dd className="inline-flex items-center gap-1">
                  <Clock aria-hidden className="size-3.5" />
                  {duration}
                </dd>
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

      <div className="flex flex-col gap-5 px-5 py-4">
        {interview.status !== "completed" && (
          <p className="text-[#737373]">{STATUS_TEXT[interview.status]}</p>
        )}

        {interview.status === "completed" && interview.reportStatus !== "done" && (
          <p className="text-[#737373]">
            {interview.reportStatus !== "failed"
              ? pendingText
              : aiAvailable
                ? "The AI report couldn't be written. Read the answers below, or retry."
                : "AI unavailable, so there's no report. Read the answers below."}
          </p>
        )}

        {done && report && (
          <>
            {report.summary && (
              <p className="leading-relaxed break-words text-[#262626]">{report.summary}</p>
            )}

            {(report.strengths.length > 0 || report.concerns.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {report.strengths.length > 0 && (
                  <div className="min-w-0 rounded-lg border border-[#e5e5e5] p-3">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#15803d]">
                      <CheckCircle2 aria-hidden className="size-4" /> Strengths
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5 break-words text-[#404040]">
                      {report.strengths.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span
                            aria-hidden
                            className="mt-2 size-1 shrink-0 rounded-full bg-[#a3a3a3]"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.concerns.length > 0 && (
                  <div className="min-w-0 rounded-lg border border-[#e5e5e5] p-3">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#b45309]">
                      <AlertTriangle aria-hidden className="size-4" /> Check in the live interview
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5 break-words text-[#404040]">
                      {report.concerns.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span
                            aria-hidden
                            className="mt-2 size-1 shrink-0 rounded-full bg-[#a3a3a3]"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <section aria-label="Skills" className="flex flex-col gap-2">
              <SubHeading>Skills</SubHeading>
              <ul className="flex flex-col divide-y divide-[#f0f0f0] rounded-lg border border-[#e5e5e5]">
                {report.skills.map((entry) => (
                  <li key={entry.skill} className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 font-medium break-words text-[#121212]">
                        {entry.skill}
                      </span>
                      <ScoreDots score={entry.score} />
                    </div>
                    <span className="min-w-0 text-[13px] break-words text-[#737373]">
                      {entry.quote ? <q>{entry.quote}</q> : <span>No evidence</span>}
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
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 break-words text-[#92400e]">
            <Flag aria-hidden className="size-3.5 shrink-0" />
            <span className="font-medium">Flags:</span> {flags.join(" · ")}{" "}
            <span className="opacity-80">(for context, not a reason to reject)</span>
          </p>
        )}

        {interview.transcript.length > 0 && (
          <details className="group rounded-lg border border-[#e5e5e5]">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-[#404040] select-none hover:text-[#121212]">
              View full chat
            </summary>
            <div className="border-t border-[#f0f0f0] p-3">
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
      </div>
    </section>
  );
}
